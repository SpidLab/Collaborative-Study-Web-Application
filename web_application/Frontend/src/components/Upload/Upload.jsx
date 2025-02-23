import React, { useState } from 'react';
import { TextField, Button, Container, Typography, Box, Paper, IconButton } from '@mui/material';
// import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import axios from 'axios';
import URL from '../../config';
import { CircularProgress } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';


const UploadForm = () => {
    const [field1, setField1] = useState('');
    const [field2, setField2] = useState('');
    // const [csvFile, setCSVFile] = useState(null);
    // const [fileName, setFileName] = useState('');
    const getToken = () => {
        return localStorage.getItem('token');
    };
    const token = getToken();

    const [loading, setLoading] = useState(false);

    const handleField1Change = (event) => {
        setField1(event.target.value);
    };

    const handleField2Change = (event) => {
        setField2(event.target.value);
    };

    // const handleFileChange = (event) => {
    //     const file = event.target.files[0];
    //     setCSVFile(file);
    //     setFileName(file.name);
    // };

    // const handleDrop = (event) => {
    //     event.preventDefault();
    //     const file = event.dataTransfer.files[0];
    //     setCSVFile(file);
    //     setFileName(file.name);
    // };

    // const handleDragOver = (event) => {
    //     event.preventDefault();
    // };
            
    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);

        try {
            const formData = new FormData();
            formData.append('phenotype', field1);
            formData.append('number_of_samples', field2);
            // if (csvFile) {
            //     formData.append('file', csvFile);
            // } else {
            //     throw new Error('No file selected.');
            // }

            const response = await axios.post(`${URL}/api/upload_csv_qc`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${token}`
                },
            });

            if (response.status === 200) {
                alert('Dataset uploaded successfully.');
                setField1('');
                setField2('');
                // setCSVFile(null);
                // setFileName('');
            } else {
                throw new Error('Upload failed.');
            }
        } catch (error) {
            alert('Error uploading dataset.');
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container component="div" maxWidth="sm" sx={{ padding: 4 }}>
            <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'light' }}>
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
                    InputProps={{
                        sx: {borderRadius: 2, borderColor: 'divider'}
                      }}
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
                    InputProps={{
                        sx: {borderRadius: 2, borderColor: 'divider'}
                      }}
                />
                {/* <Box
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
                            {fileName || 'Upload Noisy Dataset'}
                        </Typography>
                    </label>
                </Box> */}
                {loading ? (
                    <Box display="flex" justifyContent="center" alignItems="center" mt={2} sx={{
                        backgroundColor: '#fafafa',
                    }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        fullWidth
                        sx={{ marginTop: 2, padding: 2, fontSize: '1rem', borderRadius: 100 }}
                    >
                        Upload Dataset
                    </Button>
                )}
                <Box sx={{ bgcolor: '#f9fdff', mt: 2, p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', gap: 2}} display={'flex'}>
                    <InfoIcon sx={{color: 'primary.main', fontSize: 20}}/>
                    <Typography variant="body2">You will be required to upload a dataset file when initiating or participating in a collaboration.</Typography>
                </Box>
            </form>
        </Container>
    );
};

export default UploadForm;