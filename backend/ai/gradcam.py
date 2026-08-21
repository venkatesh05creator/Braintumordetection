"""
Grad-CAM Heatmap Generator

Produces gradient-weighted class activation maps overlaid on the original MRI.
When TensorFlow + trained model are available, uses true Grad-CAM.
Otherwise, uses saliency approximation via OpenCV.
"""

import io
import logging

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

_tf_available = False
try:
    import tensorflow as tf
    _tf_available = True
except ImportError:
    pass


def _heatmap_keras(image_bytes: bytes, model, class_index: int) -> np.ndarray:
    """True Grad-CAM heatmap (224x224 float, 0-1) using TensorFlow GradientTape."""
    import tensorflow as tf

    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((224, 224))
    img_array = np.array(pil_img, dtype=np.float32) / 255.0
    img_array = np.expand_dims(img_array, 0)

    # 🔹 Robustly retrieve "top_conv" layer (handles nested submodels)
    last_conv_layer = None
    try:
        last_conv_layer = model.get_layer("top_conv")
    except ValueError:
        # Search inside nested layers/sequential blocks
        for layer in model.layers:
            if hasattr(layer, "layers"):
                try:
                    last_conv_layer = layer.get_layer("top_conv")
                    if last_conv_layer:
                        break
                except ValueError:
                    pass

    # Fallback to search by name/type
    if last_conv_layer is None:
        for layer in reversed(model.layers):
            if hasattr(layer, "layers"):
                for sub in reversed(layer.layers):
                    if "conv" in sub.name.lower() or "top_conv" in sub.name.lower():
                        last_conv_layer = sub
                        break
                if last_conv_layer:
                    break
            elif "conv" in layer.name.lower():
                last_conv_layer = layer
                break

    if last_conv_layer is None:
        logger.warning("No convolution layer found for Grad-CAM. Falling back to OpenCV approximation.")
        raise ValueError("no convolution layer found")

    grad_model = tf.keras.models.Model(
        inputs=model.inputs,
        outputs=[last_conv_layer.output, model.output],
    )

    with tf.GradientTape() as tape:
        conv_outputs, predictions = grad_model(img_array)
        loss = predictions[:, class_index]

    grads = tape.gradient(loss, conv_outputs)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
    conv_outputs = conv_outputs[0]
    
    # Calculate heatmap weighted output matching the notebook logic
    heatmap = tf.reduce_sum(conv_outputs * pooled_grads, axis=-1)
    heatmap = tf.maximum(heatmap, 0)
    heatmap /= (tf.reduce_max(heatmap) + 1e-8)
    heatmap = heatmap.numpy()

    return cv2.resize(heatmap, (224, 224))


def _heatmap_opencv(image_bytes: bytes) -> np.ndarray:
    """Saliency-based heatmap approximation (224x224 float, 0-1).

    Uses brightness gradient (Laplacian) to estimate regions of interest.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Cannot decode image for Grad-CAM.")
    img = cv2.resize(img, (224, 224))

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Use Laplacian + intensity as saliency proxy
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    saliency = np.abs(laplacian)
    saliency = cv2.GaussianBlur(saliency, (21, 21), 0)

    # Normalize to 0-1
    saliency -= saliency.min()
    saliency /= (saliency.max() + 1e-7)
    return saliency


def _get_heatmap(image_bytes: bytes, model=None, class_index: int = 0) -> np.ndarray:
    """Return a 224x224 float activation map (Keras Grad-CAM or OpenCV fallback)."""
    if _tf_available:
        if model is None:
            from ai.agent_local_cv import _tf_model
            model = _tf_model
        if model is not None:
            try:
                return _heatmap_keras(image_bytes, model, class_index)
            except Exception as e:
                logger.error("Failed to run Keras Grad-CAM: %s", e)

    return _heatmap_opencv(image_bytes)


def generate_gradcam(
    image_bytes: bytes,
    model=None,
    class_index: int = 0,
) -> bytes:
    """
    Generate Grad-CAM heatmap overlaid on original MRI.

    Args:
        image_bytes: Raw image bytes.
        model: Loaded Keras model (optional). If None, uses approximation.
        class_index: Class index to generate heatmap for.

    Returns:
        Heatmap-overlaid image as JPEG bytes.
    """
    heatmap = _get_heatmap(image_bytes, model, class_index)
    heatmap_uint8 = np.uint8(255 * np.clip(heatmap, 0, 1))
    heatmap_colored = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)

    # Overlay on original image
    nparr = np.frombuffer(image_bytes, np.uint8)
    original = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    original = cv2.resize(original, (224, 224))
    superimposed = cv2.addWeighted(original, 0.6, heatmap_colored, 0.4, 0)

    success, encoded = cv2.imencode(".jpg", superimposed, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not success:
        raise RuntimeError("Failed to encode Grad-CAM image.")
    return encoded.tobytes()


def compute_gradcam_peak_region(
    image_bytes: bytes,
    model=None,
    class_index: int = 0,
) -> str | None:
    """Coarse anatomical label for the Grad-CAM activation peak.

    Uses the same activation map as :func:`generate_gradcam` and locates its
    centroid relative to the brain mask. Returns ``None`` when the image
    cannot be processed or there is no meaningful activation.
    """
    try:
        heatmap = _get_heatmap(image_bytes, model, class_index)
        from ai.segmentation import _segment_masks
        from ai.regions import classify_region
        _, skull_mask, _ = _segment_masks(image_bytes)
        return classify_region(heatmap, skull_mask, heatmap=True)
    except Exception as exc:
        logger.debug("Could not compute Grad-CAM peak region: %s", exc)
        return None
