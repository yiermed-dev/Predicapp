# Predicapp

## Build and Run the Docker Container Locally

1. **Clone the repository**:
   ```sh
   git clone https://github.com/yiermed-dev/predicapp.git
   cd predicapp
   ```

2. **Build the Docker Image**:
   ```sh
   docker build -t predicapp .
   ```

3. **Run the Docker Container**:
   ```sh
   docker run -d -p 8080:8080 predicapp
   ```

4. **Access the application**:
   Open your web browser and go to `http://localhost:8080`.

## Deployment Instructions

To deploy the application to a server:
1. **Ensure Docker is installed on the server**.
2. **Pull the Docker image**:
   ```sh
   docker pull your_dockerhub_username/predicapp
   ```
3. **Run the Docker Container on the server**:
   ```sh
   docker run -d -p 8080:8080 your_dockerhub_username/predicapp
   ```
4. **Visit your application**:
   Go to the server's IP address at port 8080.

Replace `your_dockerhub_username` with your actual Docker Hub username for deployment instructions.