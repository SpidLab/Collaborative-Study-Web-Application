import React, { useState } from 'react';
import {
  Container, TextField, Button, List, ListItem, ListItemText, IconButton, Typography, Box, Paper, Divider,
  Snackbar, Alert, CircularProgress, Grid, Card, CardContent, Chip
} from '@mui/material';
import { Add, Delete, Upload } from '@mui/icons-material';
import SearchPage from '../Search/Search';
import axios from 'axios';
import URL from '../../config';

const StartCollaboration = () => {
  const [collabName, setCollabName] = useState('');
  const [experimentName, setExperimentName] = useState('');
  const [experimentList, setExperimentList] = useState([]);
  const [rawData, setRawData] = useState(null);
  const [metaData, setMetaData] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [resetSearch, setResetSearch] = useState(false);

  const handleAddExperiment = () => {
    if (experimentName.trim()) {
      setExperimentList([...experimentList, experimentName]);
      setExperimentName('');
    }
  };

  const handleDeleteExperiment = (index) => {
    const updatedList = experimentList.filter((_, i) => i !== index);
    setExperimentList(updatedList);
  };

  const handleFileUpload = (e, setData) => {
    setData(e.target.files[0]);
  };

  const handleCreateCollaboration = async () => {
    if (selectedUsers.length === 0) {
      setSnackbar({ open: true, message: "Please select users for invitation.", severity: 'error' });
      return;
    }

    setIsLoading(true);

    const collaborationData = {
      collabName,
      experiments: experimentList,
      rawData: rawData ? rawData.name : null,
      metaData: metaData ? metaData.name : null,
      invitedUsers: selectedUsers.map(user => ({
        _id: user._id,
        phenotype: user.phenotype
      })),
    };

    try {
      const createCollabResponse = await axios.post(`${URL}/api/start_collaboration`, collaborationData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const { collaboration_uuid } = createCollabResponse.data;

      const invitationPromises = selectedUsers.map(user =>
        axios.post(`${URL}/api/sendinvitation`, {
          receiver_id: user._id,
          phenotype: user.phenotype,
          collaboration_uuid: collaboration_uuid
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
      );

      await Promise.all(invitationPromises);

      setSnackbar({
        open: true,
        message: 'Collaboration created and invitations sent successfully!',
        severity: 'success'
      });

      setCollabName('');
      setExperimentList([]);
      setRawData(null);
      setMetaData(null);
      setSelectedUsers([]);
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
            margin="normal"
            value={collabName}
            onChange={(e) => setCollabName(e.target.value)}
          />

          <Box mt={2}>
            <TextField
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
                Upload
              </Typography>
              <Divider sx={{ flexGrow: 30, borderColor: 'black' }} />
            </Box>
            <Box my={2}>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                sx={{ mb: 2 }}
              >
                Upload Raw Data
                <input type="file" hidden onChange={(e) => handleFileUpload(e, setRawData)} />
              </Button>
              {rawData && <Typography variant="body2" sx={{ mt: 1 }}>Selected: {rawData.name}</Typography>}
            </Box>
            <Box my={2}>
              <Button
                variant="outlined"
                component="label"
                fullWidth
              >
                Upload Meta Data
                <input type="file" hidden onChange={(e) => handleFileUpload(e, setMetaData)} />
              </Button>
              {metaData && <Typography variant="body2" sx={{ mt: 1 }}>Selected: {metaData.name}</Typography>}
            </Box>
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
          sx={{ py: 2, fontSize: '1.1rem' }}
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