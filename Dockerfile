# Dockerfile

FROM nginx:alpine

# Copy static HTML files to the Nginx server
COPY ./dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]