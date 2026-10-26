# Production Standards & Design Guidelines

These rules apply strictly to all code, styling, copy, and UI/UX in this project:

## 1. Visual & Aesthetic Rules
- **No purple gradients:** Never use purple, violet, or magenta gradients anywhere in the application. Avoid cliché AI SaaS gradient themes.
- **Color palette:** Use clean, professional clinical tones: medical slate, deep navy, clinical teal (`#0d9488`), and precision cyan/cobalt.
- **No vibe-coded tropes:** Avoid floating neon orbs, glowing purple card borders, and cliché "AI glow" aesthetic effects.
- **No cursor animations:** Standard system cursor only (`cursor: pointer` on interactive elements). Never add custom trailing cursor effects, canvas cursors, or magnetic cursor followers.
- **No over-the-top scroll animations:** Smooth standard scrolling only. No parallax distortion, scroll jacking, or exaggerated bouncy scroll transforms.

## 2. Iconography & Media Standards
- **No emoji icons in the UI:** Never use raw emojis (such as 🚀, ✨, 🔥, 🧬, ⚠️, 💬, 🤖, 🏥, 🩺) as UI icons. Use clean, professional SVG icons from `lucide-react`.
- **No AI slop photos:** Do not use uncanny, generated AI stock photos of fake doctors or fantasy brains. Use crisp SVG diagrams, clean radiology data representations, and standard medical UI components.
- **Real favicon:** Must use dedicated medical brain/clinical SVG favicon, never the default Vite or framework logo.

## 3. Copywriting & Content Standards
- **No em dashes (`—`):** Never use em dashes in visible UI copy, titles, or marketing text. Use colons, hyphens (`-`), commas, or clean sentences.
- **No fake hero text or AI slop copy:** Keep copy grounded, professional, concise, and clinically authentic.
- **No fake reviews or metrics:** Never add fabricated testimonials ("Dr. Jane Doe from Stanford"), fake customer counters ("10,000+ hospitals trust us"), or unsubstantiated marketing statistics.
- **No "Made with AI" tags:** Never display "Made with AI", "Built by AI", or AI generator branding in footers, headers, or metadata.

## 4. Pre-Launch Requirements
- Connected custom domain configured with SSL and proper CORS.
- Favicon properly linked and verified.
- Privacy Policy page (`/privacy`) covering medical data handling, PHI, encryption, and data rights.
- Terms and Conditions page (`/terms`) covering clinical decision-support disclaimers, liability, and clinician oversight.
