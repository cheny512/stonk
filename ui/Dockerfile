FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build for production? No, for a portfolio it's often easier to run dev server if they want to edit,
# or we can build and serve. Let's just run dev server so it binds to 5173.
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]