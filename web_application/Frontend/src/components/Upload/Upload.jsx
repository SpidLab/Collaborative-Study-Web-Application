import React, { useState } from 'react';
import { TextField, Button, Container, Typography, Box, Paper, IconButton } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import axios from 'axios';
import URL from '../../config';

const UploadForm = () => {
    const [field1, setField1] = useState('');
    const [field2, setField2] = useState('');
    const [csvFile, setCSVFile] = useState(null);
    const [fileName, setFileName] = useState('');

    const handleField1Change = (event) => {
        setField1(event.target.value);
    };

    const handleField2Change = (event) => {
        setField2(event.target.value);
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        setCSVFile(file);
        setFileName(file.name);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        setCSVFile(file);
        setFileName(file.name);
    };

    const handleDragOver = (event) => {
        event.preventDefault();
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        try {
            const formData = new FormData();
            formData.append('field1', field1);
            formData.append('field2', field2);
            if (csvFile) {
                formData.append('file', csvFile);
            } else {
                throw new Error('No file selected.');
            }

            const response = await axios.post(`${URL}/api/upload_csv`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            if (response.status === 200) {
                alert('Dataset uploaded successfully.');
                setField1('');
                setField2('');
                setCSVFile(null);
                setFileName('');
            } else {
                throw new Error('Upload failed.');
            }
        } catch (error) {
            alert('Error uploading dataset.');
            console.error('Error:', error);
        }
    };

    return (
        <Container component="div" maxWidth="sm" sx={{ padding: 4, borderRadius: 2 }}>
            <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'bold' }}>
                Dataset Metadata Upload
            </Typography>
            <form onSubmit={handleSubmit}>
                <TextField
                    fullWidth
                    label="Phenotype(s)"
                    id="field1"
                    name="field1"
                    value={field1}
                    onChange={handleField1Change}
                    variant="outlined"
                    margin="normal"
                />
                <TextField
                    fullWidth
                    label="# of Samples"
                    id="field2"
                    name="field2"
                    value={field2}
                    onChange={handleField2Change}
                    variant="outlined"
                    margin="normal"
                />
                <Box
                    sx={{
                        border: '2px dashed #ccc',
                        borderRadius: '8px',
                        padding: 2,
                        textAlign: 'center',
                        marginTop: 2,
                        backgroundColor: '#fafafa',
                        cursor: 'pointer',
                        transition: 'background-color 0.3s',
                        '&:hover': {
                            backgroundColor: '#f0f0f0',
                        },
                    }}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                >
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                        id="csv-file-input"
                    />
                    <label htmlFor="csv-file-input" style={{ display: 'block', cursor: 'pointer' }}>
                        <IconButton color="primary" component="span">
                            <CloudUploadIcon sx={{ fontSize: 40 }} />
                        </IconButton>
                        <Typography variant="body1">
                            {fileName || 'Drag and drop a CSV file here, or click to select a file'}
                        </Typography>
                    </label>
                </Box>
                <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    fullWidth
                    sx={{ marginTop: 2, padding: 2, fontSize: '1rem' }}
                >
                    Upload Dataset
                </Button>
            </form>
        </Container>
    );
};

export default UploadForm;
