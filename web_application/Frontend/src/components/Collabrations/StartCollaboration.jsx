import React, { useState, useEffect } from 'react';
import {
  Container, TextField, Button, Checkbox, IconButton, Typography, Box, Divider,
  Snackbar, Alert, CircularProgress, Grid, Card, CardContent, Chip, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { Add, Delete, Upload, Info, RadioButtonUncheckedRounded } from '@mui/icons-material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SearchPage from '../Search/Search';
import axios from 'axios';
import URL from '../../config';
import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';



//we need to make changes here
const StartCollaboration = () => {
  const [collabName, setCollabName] = useState('');
  // const [experimentName, setExperimentName] = useState('');
  const [experimentList, setExperimentList] = useState([]);
  const [experimentOptions, setExperimentOptions] = useState([]);
  // const [phenoType, setPhenotype] = useState('');
  // const [samples, setSamples] = useState('');
  // const [rawData, setRawData] = useState(null);
  const [csvFile, setCSVFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [resetSearch, setResetSearch] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState('');

  // **Fetch Datasets on Component Mount**
  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const response = await axios.get(`${URL}/api/start_collaboration`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        console.log(response.data);
        setDatasets(response.data.datasets);
      } catch (error) {
        console.error("Error fetching datasets:", error);
        setSnackbar({
          open: true,
          message: 'Failed to fetch datasets. Please try again.',
          severity: 'error'
        });
      }
    };

    fetchDatasets();
  }, []);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        // TODO: Replace this with actual API call when backend is ready
        // const response = await axios.get("YOUR_BACKEND_API_URL");
        // setExperimentOptions(response.data);
        const data = ["Chi-Square", "Odd Ratio"];
        setExperimentOptions(data);
      } catch (error) {
        console.error("Error fetching experiment options:", error);
      }
    };
    fetchOptions();
  }, []);

  // const handleAddExperiment = () => {
  //   if (experimentName.trim()) {
  //     setExperimentList([...experimentList, experimentName]);
  //     setExperimentName('');
  //   }
  // };

  const handleAddExperiment = (event) => {
    const selectedExperiment = event.target.value;
    if (selectedExperiment && !experimentList.includes(selectedExperiment)) {
      setExperimentList([...experimentList, selectedExperiment]);
    }
  };

  const handleDeleteExperiment = (index) => {
    const updatedList = experimentList.filter((_, i) => i !== index);
    setExperimentList(updatedList);
  };

  // const handleFileUpload = (e, setData) => {
  //   setData(e.target.files[0]);
  // };

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
  const handleCreateCollaboration = async () => {
    // console.log("Selected Users:", selectedUsers);

    if (selectedUsers.length === 0) {
      setSnackbar({ open: true, message: "Please select users for invitation.", severity: 'error' });
      return;
    }

    if (!selectedDataset) {
      setSnackbar({ open: true, message: "Please select a dataset.", severity: 'error' });
      return;
    }


    setIsLoading(true);
    const collaborationData = {
      collabName,
      experiments: experimentList,
      // phenoType,
      // samples,
      // rawData: rawData ? rawData.name : null,
      creatorDatasetId: selectedDataset.dataset_id,
      invitedUsers: selectedUsers.map(user => ({
        _id: user._id,
        dataset_id: user.dataset_id,
        phenotype: user.phenotype,
      })),
    };

    try {
      const createCollabResponse = await axios.post(`${URL}/api/start_collaboration`, collaborationData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const { collaboration_id } = createCollabResponse.data;

      const invitationPromises = selectedUsers.map(user =>
        axios.post(`${URL}/api/sendinvitation`, {
          receiver_id: user._id,
          phenotype: user.phenotype,
          collaboration_id: collaboration_id
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
      );
      await Promise.all(invitationPromises);
      if (csvFile) {
        const formData = new FormData();
        formData.append('file', csvFile);
        formData.append('dataset_id', selectedDataset.dataset_id);

        await axios.post(`${URL}/api/update_qc_data`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
      }

      setSnackbar({
        open: true,
        message: 'Collaboration created and invitations sent successfully!',
        severity: 'success'
      });

      setCollabName('');
      setExperimentList([]);
      // setPhenotype('');
      // setSamples('');
      // setRawData(null);
      setCSVFile(null);
      setFileName('');
      setSelectedUsers([]);
      setSelectedDataset('');
      setExperimentOptions([]);
      setResetSearch(prev => !prev);

    } catch (error) {
      console.error("Error creating collaboration or sending invitations:", error);
      setSnackbar({
        open: true,
        message: 'Failed to create collaboration or send invitations. Please try again.',
        severity: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  const handleUserSelect = (users) => {
    setSelectedUsers(users);
  };

  const handleDatasetChange = (event) => {
    const selectedDataset = event.target.value;
    setSelectedDataset(selectedDataset);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" align="left" gutterBottom sx={{ fontWeight: 'light' }}>
        Start a New Collaboration
      </Typography>
      <Card sx={{ height: '100%', marginBottom: '20px', border: '1px solid #ccc', borderRadius: 2, boxShadow: 'none' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                color: 'white',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                mr: 2,
                fontWeight: 'bold'
              }}
            >
              1
            </Box>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Collaboration Details
            </Typography>
            <Divider sx={{ flexGrow: 30, borderColor: 'black' }} />
          </Box>

          <TextField
            label="Collaboration Name"
            variant="outlined"
            fullWidth
            sx={{ mt: 2 }}
            value={collabName}
            onChange={(e) => setCollabName(e.target.value)}
            InputProps={{
              sx: { borderRadius: 2, borderColor: 'divider' }
            }}

          />

          <Box mt={2}>
            {/* <TextField
              label="Experiment Name"
              variant="outlined"
              fullWidth
              value={experimentName}
              onChange={(e) => setExperimentName(e.target.value)}
              sx={{ mb: 1 }}
            />
            <Button
              variant="contained"
              color="primary"
              startIcon={<Add />}
              onClick={handleAddExperiment}
              sx={{ mb: 2 }}
            >
              Add Experiment
            </Button>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {experimentList.map((experiment, index) => (
                <Chip
                  key={index}
                  label={experiment}
                  onDelete={() => handleDeleteExperiment(index)}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Box>*/}
            <FormControl fullWidth sx={{ mb: 1 }}>
              <InputLabel id="experiment-select-label" >Experiment Type</InputLabel>
              <Select
                value=""
                onChange={handleAddExperiment}
                labelId="experiment-select-label"
                label="Experiment Name"
                sx={{ borderRadius: 2, borderColor: 'divider' }}>
                {experimentOptions.map((option, index) => (
                  <MenuItem key={index} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {experimentList.map((experiment, index) => (
                <Chip
                  key={index}
                  label={experiment}
                  onDelete={() => handleDeleteExperiment(index)}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Grid item xs={12} md={6}>
        <Card sx={{ height: '100%', marginBottom: '20px', border: '1px solid #ccc', borderRadius: 2, boxShadow: 'none' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  color: 'white',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  mr: 2,
                  fontWeight: 'bold'
                }}
              >
                2
              </Box>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                Quality Control
              </Typography>
              <Divider sx={{ flexGrow: 30, borderColor: 'black' }} />
            </Box>
            <Box my={2}>
              {/* <TextField
                label="Phenotype"
                variant="outlined"
                fullWidth
                sx={{ mt: 2 }}
                value={phenoType}
                onChange={(e) => setPhenotype(e.target.value)}
              />
              <TextField
                label="Number of Samples"
                variant="outlined"
                type="number"
                fullWidth
                sx={{ mt: 2 }}
                value={samples}
                onChange={(e) => setSamples(e.target.value)}
              /> */}

              {/* Place Holder Choose Quality Control Scheme  */}
              <Box sx={{p:1.5, backgroundColor: '#FAFAFA', border: '1px solid', borderColor: 'divider', borderRadius: 2}}>
                Choose your QC Scheme
                <Box display="flex" gap={2} sx={{ mt: 1.5 }}>
                  {["None", "Sample Relatedness", "Population Stratification"].map((label, index) => (
                    <Box
                      key={index}
                      display="flex"
                      alignItems="center"
                      sx={{
                        pr: 1.5,
                        borderRadius: 10,
                        border: '1px solid',
                        borderColor: 'divider',
                        boxShadow: "0px",
                        cursor: "pointer",
                        transition: "background 0.3s",
                        "&:hover": { backgroundColor: "#e8f1fa" },
                      }}
                    >
                      <Checkbox
                        defaultChecked={index === 1} // First one checked by default
                        // onChange={() => handleExperimentChange(index)}
                        icon={<RadioButtonUncheckedRounded />}
                        checkedIcon={<CheckCircleIcon />}
                        sx={{
                          color: "#1976d2",
                          "&.Mui-checked": { color: "#1565c0" },
                          "& .MuiSvgIcon-root": { borderRadius: "50%" }, // Make checkbox circular
                        }}
                      />
                      <Typography variant="body1" sx={{ fontSize: 14 }}>{label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
              {/* **New Dropdown for Selecting Datasets** */}
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel id="dataset-select-label">Select Dataset</InputLabel>
                <Select
                  labelId="dataset-select-label"
                  id="dataset-select"
                  value={selectedDataset}
                  label="Select Dataset"
                  onChange={handleDatasetChange}
                  sx={{ borderRadius: 2, borderColor: 'divider' }}
                >
                  {datasets.length > 0 ? (
                    datasets.map((dataset, index) => (
                      <MenuItem key={index} value={dataset}>
                        {`${dataset.phenotype} | ${dataset.number_of_samples}`}
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem value="">
                      No Datasets Available. You can upload your datasets
                      <a href="/upload" target="_blank" rel="noopener noreferrer" style={{ color: 'primary.main', textDecoration: 'underline', marginLeft: '5px' }}>
                        here
                      </a>.
                    </MenuItem>
                  )}
                </Select>
              </FormControl>

              {/* <Button
                variant="outlined"
                component="label"
                fullWidth
                sx={{ mt: 2 }}
              >
                Upload Dataset
                <input type="file" hidden onChange={(e) => handleFileUpload(e, setRawData)} />
              </Button> */}
              {/* {rawData && <Typography variant="body2" sx={{ mt: 1 }}>Selected: {rawData.name}</Typography>}
              <Box display="flex" alignItems="center" sx={{ bgcolor: '#e3f2fd', color: '#1876D1', border: '1px solid #e3f2fd', borderRadius: 2, p: '5px', mt: 1 }}>
                <Info sx={{ fontSize: '18px' }} />
                <Typography variant="body1" sx={{ marginLeft: 1, fontSize: '14px' }}>
                  Upload the Noisy version of Dataset
                </Typography>
              </Box> */}
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
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
                    {fileName || 'Upload Dataset File'}
                  </Typography>
                </label>
              </Box>
            </Box>
            {(csvFile && selectedDataset) && (
              <Box sx={{ bgcolor: '#f9fdff', mt: 2, p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', gap: 2 }} display={'flex'}>
                <InfoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                <Typography variant="body2">{fileName} will be linked to {selectedDataset.phenotype} for this collaboration.</Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        <Grid item xs={12}>
          <Card sx={{ height: '100%', marginBottom: '20px', border: '1px solid #ccc', borderRadius: 2, boxShadow: 'none' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    mr: 2,
                    fontWeight: 'bold'
                  }}
                >
                  3
                </Box>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  Find Collaborators
                </Typography>
                <Divider sx={{ flexGrow: 30, borderColor: 'black' }} />
              </Box>
              <SearchPage onUserSelect={handleUserSelect} resetTrigger={resetSearch} />
              {/* {selectedUsers.length > 0 && (
                <Box mt={3}>
                  <Grid container spacing={2}>
                    {selectedUsers.map((user) => (
                      <Grid item xs={12} sm={6} md={4} key={user._id}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="subtitle2">{user.name}</Typography>
                            <Typography variant="body2" color="textSecondary">
                              Phenotype: {user.phenotype}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              Samples: {user.numberOfSamples}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )} */}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box mt={4}>
        <Button
          variant="contained"
          color="primary"
          fullWidth
          size="large"
          onClick={handleCreateCollaboration}
          disabled={isLoading}
          sx={{ py: 2, fontSize: '1.1rem', borderRadius: 100 }}
        >
          {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Create Collaboration'}
        </Button>
      </Box>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default StartCollaboration;
