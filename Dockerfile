FROM ghcr.io/puppeteer/puppeteer:latest

USER root

# Convertirse en el usuario node de la imagen o usar root, root evita problemas de permisos al instalar
WORKDIR /app

# Copia los archivos de paquete de Node
COPY package*.json ./

# Instala todas las dependencias (incluyendo puppeteer y whatsapp-web.js)
RUN npm install

# Copia el resto del código
COPY . .

# Exponer el puerto para Express
EXPOSE 3000

# Se asegura que puppeteer use el chromium precargado en la imagen
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Comando de inicio
CMD ["npm", "start"]
