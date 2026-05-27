FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN node scripts/generate-template.js
EXPOSE 3000
CMD ["node", "./bin/www"]
