import React, { useState } from 'react';
import { TextField, Button, Container, Typography } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

function UploadForm() {
    const [field1, setField1] = useState('');
    const [field2, setField2] = useState('');
    const [field3, setField3] = useState('');

    const handleField1Change = (event) => {
        setField1(event.target.value);
    };

    const handleField2Change = (event) => {
        setField2(event.target.value);
    };

    const handleField3Change = (event) => {
        setField3(event.target.value);
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        console.log('Field 1:', field1);
        console.log('Field 2:', field2);
        console.log('Field 3:', field3);
    };

    return (
        <Container component="div" maxWidth="sm" sx={{ marginTop: 4 }}>
            <Typography variant="h5" align="center" gutterBottom>
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
                <TextField
                    fullWidth
                    label="List of SPNs"
                    id="field3"
                    name="field3"
                    value={field3}
                    onChange={handleField3Change}
                    variant="outlined"
                    margin="normal"
                />
                <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    startIcon={<CloudUploadIcon />}
                    fullWidth
                    sx={{ marginTop: 2 }}
                >
                    Upload Dataset
                </Button>
            </form>
        </Container>
    );
}

export default UploadForm;
