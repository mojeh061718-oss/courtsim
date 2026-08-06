FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server ./server
COPY client ./client
# Ships the owner's committed .env (keys wired in at the owner's direction);
# real environment variables still override it at runtime.
COPY .env* ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/index.js"]
