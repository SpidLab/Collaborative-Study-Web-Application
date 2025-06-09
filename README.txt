# Collaborative Study Web Application

## Overview
The Collaborative Study Web Application is a comprehensive platform designed to facilitate collaborative research studies. It provides tools for managing datasets, generating metadata, performing quality control (QC), and statistical analysis. The application is built with a modular architecture, including a Flask-based backend and a React-based frontend.

## Features
- **User Authentication**: Secure user registration, login, and logout.
- **Profile Management**: Update user profiles, including name and password.
- **Invitations**: Send, accept, and reject collaboration invitations.
- **Collaboration Management**: Manage collaborations, including adding/removing participants and updating experiments.
- **Dataset Management**: Upload and manage datasets, including QC and statistical data.
- **Metadata Generation**: Generate metadata for datasets using Python scripts.
- **Quality Control**: Perform QC on datasets to ensure data integrity.
- **Statistical Analysis**: Upload and analyze statistical data.

## Project Structure
```
Collaborative-Study-Web-Application/
├── datasets/                # Example datasets and QC outputs
├── Metadata-Generator/      # Scripts and tools for metadata generation
├── web_application/         # Main application folder
│   ├── Backend/             # Backend services (Flask)
│   └── Frontend/            # Frontend application (React)
```

### Backend
The backend is built using Flask and provides RESTful APIs for user authentication, profile management, invitations, collaborations, and dataset operations.

#### Key Files:
- `app.py`: Main Flask application file.
- `API_Documentation.txt`: Detailed API documentation.
- `requirements.txt`: Python dependencies.
- `utils/`: Utility scripts for calculations and data processing.

### Frontend
The frontend is built using React and Vite, providing a user-friendly interface for interacting with the application.

#### Key Files:
- `index.html`: Entry point for the React application.
- `src/`: Source code for React components and assets.
- `vite.config.js`: Configuration for Vite.

### Metadata Generator
A Python-based tool for generating metadata related to datasets.

#### Key Files:
- `metadata_generation_relatedness.py`: Script for generating relatedness coefficients.
- `setup.py`: Setup script for the metadata generator.

## Installation

### Prerequisites
- Python 3.7+
- Node.js and npm
- Flask
- React

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd web_application/Backend/FlaskApp
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the Flask application:
   ```bash
   flask run
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd web_application/Frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Usage
1. Access the application in your web browser at `http://localhost:<port>`.
2. Register or log in to your account.
3. Upload datasets, manage collaborations, and perform analyses.

## Contributing
Contributions are welcome! Please follow these steps:
1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Commit your changes and push to your fork.
4. Submit a pull request.

## License
This project is licensed under the MIT License. See the `LICENSE` file for details.
