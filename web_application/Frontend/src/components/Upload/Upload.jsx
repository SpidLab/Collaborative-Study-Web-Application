import React, { useState } from 'react';
import { TextField, Button, Container, Typography } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import axios from 'axios'; // Import Axios

const UploadForm = () => {
    const [field1, setField1] = useState('');
    const [field2, setField2] = useState('');
    const [csvFile, setCSVFile] = useState(null);

    const handleField1Change = (event) => {
        setField1(event.target.value);
    };

    const handleField2Change = (event) => {
        setField2(event.target.value);
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        console.log("Selected file:", file);
        setCSVFile(file); // Update the csvFile state variable with the selected file
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

            const response = await axios.post('https://ubiquitous-space-potato-q77r667x74qx29vvr-5000.app.github.dev/api/upload_csv', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data', // Set content type to multipart/form-data
                },
            });

            if (response.status === 200) {
                alert('Dataset uploaded successfully.');
                setField1('');
                setField2('');
                setCSVFile(null);
            } else {
                throw new Error('Upload failed.');
            }
        } catch (error) {
            alert('Error uploading dataset.');
            console.error('Error:', error);
        }
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
                    sx={{ marginBottom: 1 }}
                />
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    style={{ display: 'none' }} // Hide the default file input style
                    id="csv-file-input"
                />
                <label htmlFor="csv-file-input">
                    <Button
                        variant="contained"
                        component="span"
                        startIcon={<CloudUploadIcon />}
                        fullWidth
                        sx={{ marginTop: 2 }}
                    >
                        Upload CSV File
                    </Button>
                </label>
                <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    fullWidth
                    sx={{ marginTop: 2 }}
                >
                    Upload Dataset
                </Button>
            </form>
        </Container>
    );
};

export default UploadForm;



// import React, { useState } from 'react';
// import { TextField, Button, Container, Typography } from '@mui/material';
// import CloudUploadIcon from '@mui/icons-material/CloudUpload';
// import { InboxOutlined } from '@ant-design/icons';
// import { Upload, message } from 'antd';
// import axios from 'axios'; // Import Axios

// const { Dragger } = Upload;

// const UploadForm = () => {
//     const [field1, setField1] = useState('');
//     const [field2, setField2] = useState('');
//     const [csvFile, setCSVFile] = useState(null);

//     const handleField1Change = (event) => {
//         setField1(event.target.value);
//     };

//     const handleField2Change = (event) => {
//         setField2(event.target.value);
//     };

//     const handleFileChange = (file) => {
//         console.log("Selected file:", file);
//         setCSVFile(file); // Update the csvFile state variable with the selected file
//     };
    
//     const handleSubmit = async (event) => {
//         event.preventDefault();

//         try {
//             const formData = new FormData();
//             formData.append('field1', field1);
//             formData.append('field2', field2);
//             if (csvFile) {
//                 formData.append('file', csvFile);
//             } else {
//                 throw new Error('No file selected.');
//             }
    
            
//             // Just for debugging
//             const formDataObject = {};
//             for (const [key, value] of formData.entries()) {
//                 formDataObject[key] = value;
//             }

//             console.log("FormData:", formDataObject);


//             const response = await axios.post('https://ubiquitous-space-potato-q77r667x74qx29vvr-5000.app.github.dev/api/upload_csv', formData, {
//                 headers: {
//                     'Content-Type': 'multipart/form-data', // Set content type to multipart/form-data
//                 },
//             });

//             if (response.status === 200) {
//                 message.success('Dataset uploaded successfully.');
//                 setField1('');
//                 setField2('');
//                 setCSVFile(null);
//             } else {
//                 throw new Error('Upload failed.');
//             }
//         } catch (error) {
//             message.error('Error uploading dataset.');
//             console.error('Error:', error);
//         }
//     };

//     return (
//         <Container component="div" maxWidth="sm" sx={{ marginTop: 4 }}>
//             <Typography variant="h5" align="center" gutterBottom>
//                 Dataset Metadata Upload
//             </Typography>
//             <form onSubmit={handleSubmit}>
//                 <TextField
//                     fullWidth
//                     label="Phenotype(s)"
//                     id="field1"
//                     name="field1"
//                     value={field1}
//                     onChange={handleField1Change}
//                     variant="outlined"
//                     margin="normal"
//                 />
//                 <TextField
//                     fullWidth
//                     label="# of Samples"
//                     id="field2"
//                     name="field2"
//                     value={field2}
//                     onChange={handleField2Change}
//                     variant="outlined"
//                     sx={{ marginBottom: 1 }}
//                 />
//                 <Dragger
//                     name="file"
//                     multiple={false}
//                     //beforeUpload={() => false} // Prevents automatic upload
//                     onChange={(info) => {
//                         const { status, originFileObj } = info.file;
//                         if (status === 'done') {
//                             message.success(`${originFileObj.name} file uploaded successfully.`);
//                             handleFileChange(originFileObj);
//                         } else if (status === 'error') {
//                             message.error(`${originFileObj.name} file upload failed.`);
//                         }
//                     }}
//                 >
//                     <p className="ant-upload-drag-icon">
//                         <InboxOutlined />
//                     </p>
//                     <p className="ant-upload-text">Click or drag file to this area to upload</p>
//                     <p className="ant-upload-hint">
//                         Support for a single upload, file type must be .csv
//                     </p>
//                 </Dragger>
//                 <Button
//                     type="submit"
//                     variant="contained"
//                     color="primary"
//                     startIcon={<CloudUploadIcon />}
//                     fullWidth
//                     sx={{ marginTop: 2 }}
//                 >
//                     Upload Dataset
//                 </Button>
//             </form>
//         </Container>
//     );
// };

// export default UploadForm;
