FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production 2>/dev/null || npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
