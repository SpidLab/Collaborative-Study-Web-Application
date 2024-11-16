import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Divider, Button, Slider, TextField, Chip, Grid, Snackbar, Alert, CircularProgress, Container, Card, CardContent, List, ListItem, ListItemText, IconButton, Tooltip,
} from '@mui/material';
import { Add, Edit as EditIcon, Save as SaveIcon, Cancel as CancelIcon } from '@mui/icons-material';
import { alpha } from '@mui/material';
import axios from 'axios';
import URL from '../../config';

const CollaborationDetails = () => {
  const { uuid } = useParams();
  const [collaboration, setCollaboration] = useState(null);
  const [collabName, setCollabName] = useState('');
  const [experimentName, setExperimentName] = useState('');
  const [experimentList, setExperimentList] = useState([]);
  const [phenoType, setPhenotype] = useState('');
  const [samples, setSamples] = useState('');
  const [rawData, setRawData] = useState(null);
  const [role, setRole] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [senderInfo, setSenderInfo] = useState({ id: null, name: '' });
  const [invitedUsers, setInvitedUsers] = useState([]);
  const [collaborationUuid, setCollaborationUuid] = useState('');
  const [threshold, setThreshold] = useState(50);

  const [qcResultsAvailable, setQcResultsAvailable] = useState(false);
  const [qcResults, setQcResults] = useState(null); // Optional: To store QC results
  const [isQcInitiateLoading, setIsQcInitiateLoading] = useState(false);
  const [isQcResultsLoading, setIsQcResultsLoading] = useState(false);
  const [qcInitiated, setQcInitiated] = useState(false); // New state to track QC initiation

  const [isEditing, setIsEditing] = useState(false);
  const [originalCollabName, setOriginalCollabName] = useState('');
  const [originalExperimentList, setOriginalExperimentList] = useState([]);
  const [originalPhenoType, setOriginalPhenoType] = useState('');
  const [originalSamples, setOriginalSamples] = useState('');

  const determineUserRole = (data) => {
    if (data.sender_id) {
      setRole('sender');
    } else {
      setRole('receiver');
    }
  };

  useEffect(() => {
    const fetchCollaborationDetails = async () => {
      try {
        const response = await axios.get(`${URL}/api/collaboration/${uuid}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });
        console.log(response.data);
        setCollaboration(response.data);
        setCollabName(response.data.name);
        setExperimentList(response.data.experiments || []);
        setPhenotype(response.data.datasets.phenotype || []);
        setSamples(response.data.datasets.samples || '');
        setRawData(response.data.raw_data);
        setCollaborationUuid(response.data.uuid);
        setSenderInfo({ id: response.data.sender_id, name: response.data.sender_name });
        setInvitedUsers(response.data.invited_users || []);
        determineUserRole(response.data);
      } catch (error) {
        console.error('Error fetching collaboration details:', error);
        setSnackbar({
          open: true,
          message: 'Failed to fetch collaboration details. Please try again.',
          severity: 'error',
        });
      }
    };

    fetchCollaborationDetails();
  }, [uuid]);

  const handleAddExperiment = () => {
    if (experimentName.trim()) {
      setExperimentList([...experimentList, experimentName.trim()]);
      setExperimentName('');
    } else {
      setSnackbar({ open: true, message: 'Experiment name cannot be empty.', severity: 'error' });
    }
  };

  const handleDeleteExperiment = (index) => {
    const updatedList = experimentList.filter((_, i) => i !== index);
    setExperimentList(updatedList);
  };

  const handleFileUpload = (e) => {
    setRawData(e.target.files[0]);
  };

  const handleUpdateCollaboration = async () => {
    setIsLoading(true);
    try {
      const updateData = {
        name: collabName,
        experiments: experimentList,
        phenotype: phenoType,
        samples: samples,
      };
      if (role === 'receiver') {
        updateData.raw_data = rawData ? rawData.name : null;
      }
      await axios.post(`${URL}/api/collaboration/${uuid}`, updateData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setSnackbar({
        open: true,
        message: 'Collaboration updated successfully!',
        severity: 'success',
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating collaboration:', error);
      setSnackbar({
        open: true,
        message: 'Failed to update collaboration. Please try again.',
        severity: 'error',
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

  const handleAccept = async (userId) => {
    try {
      const response = await axios.post(
        `${URL}/api/acceptinvitation`,
        {
          uuid: collaborationUuid,
          receiver_id: userId,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.status === 200) {
        setInvitedUsers((prevUsers) =>
          prevUsers.map((user) =>
            user.user_id === userId ? { ...user, status: 'accepted' } : user
          )
        );
        setSnackbar({ open: true, message: 'Invitation accepted successfully!', severity: 'success' });
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setSnackbar({ open: true, message: 'Failed to accept invitation. Please try again.', severity: 'error' });
    }
  };

  const handleReject = async (userId) => {
    try {
      const response = await axios.post(
        `${URL}/api/rejectinvitation`,
        {
          uuid: collaborationUuid,
          receiver_id: userId,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.status === 200) {
        setInvitedUsers((prevUsers) => prevUsers.filter((user) => user.user_id !== userId));
        setSnackbar({ open: true, message: 'Invitation rejected successfully!', severity: 'success' });
      }
    } catch (error) {
      console.error('Error rejecting invitation:', error);
      setSnackbar({ open: true, message: 'Failed to reject invitation. Please try again.', severity: 'error' });
    }
  };

  const handleWithdraw = async (userId) => {
    try {
      const response = await axios.post(
        `${URL}/api/withdrawinvitation`,
        {
          uuid: collaborationUuid,
          receiver_id: userId,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.status === 200) {
        setInvitedUsers((prevUsers) => prevUsers.filter((user) => user.user_id !== userId));
        setSnackbar({ open: true, message: 'Invitation withdrawn successfully!', severity: 'success' });
      }
    } catch (error) {
      console.error('Error withdrawing invitation:', error);
      setSnackbar({ open: true, message: 'Failed to withdraw invitation. Please try again.', severity: 'error' });
    }
  };

  const handleSliderChange = (event, newValue) => {
    setThreshold(newValue);
  };

  const handleSubmitThreshold = () => {
    const endpoint = '/api/submit-threshold';

    axios
      .post(endpoint, { threshold })
      .then((response) => {
        console.log('Threshold submitted successfully:', response.data);
        setSnackbar({ open: true, message: 'Threshold submitted successfully!', severity: 'success' });
      })
      .catch((error) => {
        console.error('Error submitting threshold:', error);
        setSnackbar({ open: true, message: 'Failed to submit threshold. Please try again.', severity: 'error' });
      });
  };

  const handleQcInitiate = async () => {
    setIsQcInitiateLoading(true);
    try {
      const response = await axios.post(
        `${URL}/datasets/${uuid}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      setSnackbar({ open: true, message: 'QC Calculations Initiated.', severity: 'success' });
      setQcInitiated(true); // Set QC as initiated
    } catch (error) {
      console.error('Error initiating QC calculations:', error);
      setSnackbar({ open: true, message: 'Failed to initiate QC calculations. Please try again.', severity: 'error' });
    } finally {
      setIsQcInitiateLoading(false);
    }
  };

  const handleQcResults = async () => {
    setIsQcResultsLoading(true);
    try {
      const response = await axios.get(`${URL}/api/database/get_qc`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.status === 200) {
        setSnackbar({ open: true, message: 'Results are available.', severity: 'success' });
        setQcResultsAvailable(true);
        setQcResults(response.data); // Store QC results if needed
      } else {
        setSnackbar({ open: true, message: 'Results are not available.', severity: 'info' });
      }
    } catch (error) {
      console.error('Error fetching QC results:', error);
      setSnackbar({ open: true, message: 'Results are not available.', severity: 'info' });
    } finally {
      setIsQcResultsLoading(false);
    }
  };

  const isQcInitiateEnabled =
    role === 'sender' && invitedUsers.length > 0 && invitedUsers.every(user => user.status === 'accepted');

  const isQcResultsEnabled = qcInitiated;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" align="left" gutterBottom sx={{ fontWeight: 'light' }}>
        Collaboration Details
      </Typography>

      <Grid container spacing={4}>
        {/* Left Column */}
        <Grid item xs={12} md={8}>
          {/* Collaboration Details Card */}
          <Card sx={{ height: '100%', marginBottom: '20px', border: '1px solid #ccc', borderRadius: 2, boxShadow: 'none' }}>
            <CardContent>
              {/* Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  <strong>About Collaboration</strong>
                </Typography>
                <Divider sx={{ flexGrow: 30, borderColor: 'black' }} />
                {role === 'sender' && !isEditing && (
                  <Tooltip title="Edit Collaboration Details">
                    <IconButton
                      onClick={() => {
                        // Store original values before editing
                        setOriginalCollabName(collabName);
                        setOriginalExperimentList([...experimentList]);
                        setOriginalPhenoType(phenoType);
                        setOriginalSamples(samples);
                        setIsEditing(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>

              {/* Collaboration Name */}
              {role === 'sender' ? (
                isEditing ? (
                  <TextField
                    label="Collaboration Name"
                    variant="outlined"
                    fullWidth
                    sx={{ mt: 2 }}
                    value={collabName}
                    onChange={(e) => setCollabName(e.target.value)}
                  />
                ) : (
                  <Typography variant="body1" sx={{ mt: 1 }}>
                    <strong>Title:</strong> {collabName}
                  </Typography>
                )
              ) : (
                <Typography variant="body1" sx={{ mt: 1 }}>
                  <strong>Title:</strong> {collabName}
                </Typography>
              )}

              {/* List of Details */}
              <List>
                {/* Experiments */}
                <ListItem disableGutters>
                  <ListItemText
                    primary={<strong>Experiments</strong>}
                    secondary={
                      role === 'sender' ? (
                        isEditing ? (
                          <>
                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                              <TextField
                                variant="outlined"
                                value={experimentName}
                                onChange={(e) => setExperimentName(e.target.value)}
                                size="small"
                                sx={{ mr: 2, flexGrow: 1 }}
                              />
                              <Tooltip title="Add a new experiment">
                                <Button variant="contained" color="primary" startIcon={<Add />} onClick={handleAddExperiment}>
                                  Add
                                </Button>
                              </Tooltip>
                            </Box>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
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
                          </>
                        ) : (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                            {experimentList.map((experiment, index) => (
                              <Chip key={index} label={experiment} color="primary" variant="outlined" />
                            ))}
                          </Box>
                        )
                      ) : (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                          {experimentList.map((experiment, index) => (
                            <Chip key={index} label={experiment} color="primary" variant="outlined" />
                          ))}
                        </Box>
                      )
                    }
                  />
                </ListItem>
                <Divider />

                {/* Phenotype */}
                <ListItem disableGutters>
                  <ListItemText
                    primary={<strong>Phenotype</strong>}
                    secondary={
                      role === 'sender' ? (
                        isEditing ? (
                          <TextField
                            variant="outlined"
                            fullWidth
                            value={phenoType}
                            onChange={(e) => setPhenotype(e.target.value)}
                          />
                        ) : (
                          <Typography variant="body2">{phenoType}</Typography>
                        )
                      ) : (
                        <Typography variant="body2">{phenoType}</Typography>
                      )
                    }
                  />
                </ListItem>
                <Divider />

                <ListItem disableGutters>
                  <ListItemText
                    primary={<strong>Number of Samples</strong>}
                    secondary={
                      role === 'sender' ? (
                        isEditing ? (
                          <TextField
                            variant="outlined"
                            fullWidth
                            value={samples}
                            onChange={(e) => setSamples(e.target.value)}
                          />
                        ) : (
                          <Typography variant="body2">{samples}</Typography>
                        )
                      ) : (
                        <Typography variant="body2">{samples}</Typography>
                      )
                    }
                  />
                </ListItem>
                <Divider />

                <ListItem disableGutters sx={{ mt: 2 }}>
                  <ListItemText
                    primary={<strong>Quality Control</strong>}
                    secondary={
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 2,
                          mt: 1,
                          width: '100%', // Ensure the Box takes full width of its parent
                        }}
                      >
                        {/* Wrapper for QC Initiate Button */}
                        <Box sx={{ flex: 1 }}>
                          <Tooltip
                            title={
                              !isQcInitiateEnabled
                                ? 'Waiting for users to accept the invitations, before you can initiate the QC Calculations'
                                : 'Initiate QC Calculations'
                            }
                            placement="bottom"
                          >
                            <span> 
                              <Button
                                variant="contained"
                                color="primary"
                                onClick={handleQcInitiate}
                                disabled={!isQcInitiateEnabled || isQcInitiateLoading}
                                startIcon={
                                  isQcInitiateLoading && (
                                    <CircularProgress size={20} color="inherit" />
                                  )
                                }
                                fullWidth
                                sx={{borderRadius:20}}
                              >
                                Initiate QC Calculation
                              </Button>
                            </span>
                          </Tooltip>
                        </Box>

                        {/* Wrapper for QC Results Button */}
                        <Box sx={{ flex: 1 }}>
                          <Tooltip
                            title={
                              !isQcResultsEnabled
                                ? 'Results not available to preview'
                                : 'Get QC Results'
                            }
                            placement="bottom"
                          >
                            <span>
                              <Button
                                variant="outlined"
                                color="secondary"
                                onClick={handleQcResults}
                                disabled={!isQcResultsEnabled || isQcResultsLoading}
                                startIcon={
                                  isQcResultsLoading && (
                                    <CircularProgress size={20} color="inherit" />
                                  )
                                }
                                fullWidth 
                                sx={{borderRadius:20}}
                              >
                                QC Results
                              </Button>
                            </span>
                          </Tooltip>
                        </Box>
                      </Box>
                    }
                  />
                </ListItem>
                <Divider />

                {qcResultsAvailable && (
                  <>
                    <ListItem disableGutters sx={{ mt: 2 }}>
                      <ListItemText
                        primary={<strong>Select Threshold Value</strong>}
                        secondary={
                          <Box sx={{ mt: 1 }}>
                            <Slider
                              value={threshold}
                              onChange={handleSliderChange}
                              aria-labelledby="threshold-slider"
                              valueLabelDisplay="auto"
                              step={1}
                              min={1}
                              max={100}
                              sx={{
                                color: 'primary',
                                height: 8,
                                '& .MuiSlider-track': {
                                  border: 'none',
                                },
                                '& .MuiSlider-thumb': {
                                  height: 24,
                                  width: 24,
                                  backgroundColor: '#fff',
                                  border: '2px solid currentColor',
                                  '&:focus, &:hover, &.Mui-active, &.Mui-focusVisible': {
                                    boxShadow: 'inherit',
                                  },
                                  '&::before': {
                                    display: 'none',
                                  },
                                },
                                '& .MuiSlider-valueLabel': {
                                  lineHeight: 1.2,
                                  fontSize: 12,
                                  background: 'unset',
                                  padding: 0,
                                  width: 32,
                                  height: 32,
                                  borderRadius: '50% 50% 50% 0',
                                  backgroundColor: '#1876D1',
                                  transformOrigin: 'bottom left',
                                  transform: 'translate(50%, -100%) rotate(-45deg) scale(0)',
                                  '&::before': { display: 'none' },
                                  '&.MuiSlider-valueLabelOpen': {
                                    transform: 'translate(50%, -100%) rotate(-45deg) scale(1)',
                                  },
                                  '& > *': {
                                    transform: 'rotate(45deg)',
                                  },
                                },
                              }}
                            />

                            <Typography variant="body2" gutterBottom>
                              Current Threshold: {threshold}
                            </Typography>

                            <Tooltip title="Confirm your selected threshold value" placement="top">
                              <Button variant="contained" color="primary" onClick={handleSubmitThreshold}>
                                Confirm Threshold Value
                              </Button>
                            </Tooltip>
                          </Box>
                        }
                      />
                    </ListItem>
                    <Divider />

                    {/* QC Results Section */}
                    <ListItem disableGutters sx={{ mt: 2 }}>
                      <ListItemText
                        primary={<strong>QC Results</strong>}
                        secondary={
                          qcResults ? (
                            <Box sx={{ mt: 1 }}>
                              {/* Display QC Results as needed. Here's a simple example: */}
                              <Typography variant="body2" component="pre">
                                {JSON.stringify(qcResults, null, 2)}
                              </Typography>
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              No QC results to display.
                            </Typography>
                          )
                        }
                      />
                    </ListItem>
                    <Divider />
                  </>
                )}

                {/* Upload Dataset */}
                {/* {role === 'receiver' && (
                  <>
                    <ListItem disableGutters sx={{ mt: 2 }}>
                      <ListItemText
                        primary={<strong>Upload Dataset</strong>}
                        secondary={
                          <>
                            <Button variant="outlined" component="label" fullWidth sx={{ mt: 1 }}>
                              Upload Dataset
                              <input type="file" hidden onChange={handleFileUpload} />
                            </Button>
                            {rawData && (
                              <Typography variant="body2" sx={{ mt: 1 }}>
                                Selected: {rawData.name}
                              </Typography>
                            )}
                          </>
                        }
                      />
                    </ListItem>
                    <Divider />
                  </>
                )} */}
              </List>

              {/* Save and Cancel Buttons */}
              {isEditing && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <Tooltip title="Save your changes" placement="top">
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<SaveIcon />}
                      onClick={handleUpdateCollaboration}
                      sx={{ mr: 2 }}
                      disabled={isLoading}
                    >
                      {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Save'}
                    </Button>
                  </Tooltip>
                  <Tooltip title="Cancel editing" placement="top">
                    <Button
                      variant="outlined"
                      color="secondary"
                      startIcon={<CancelIcon />}
                      onClick={() => {
                        // Revert to original values
                        setCollabName(originalCollabName);
                        setExperimentList([...originalExperimentList]);
                        setPhenotype(originalPhenoType);
                        setSamples(originalSamples);
                        setIsEditing(false);
                      }}
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                  </Tooltip>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', marginBottom: '20px', border: '1px solid #ccc', borderRadius: 2, boxShadow: 'none' }}>
            <CardContent>
              {/* Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  <strong>Collaborators</strong>
                </Typography>
                <Divider sx={{ flexGrow: 30, borderColor: 'black' }} />
              </Box>
              <List>
                <ListItem disableGutters>
                  <ListItemText
                    primary={`${senderInfo.name} (Initiator)`}
                  />
                </ListItem>
                <Divider />

                {invitedUsers.map((user, index) => (
                  <ListItem key={index} disableGutters sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ListItemText
                      primary={user.name}
                      secondary={`Phenotype: ${user.phenotype}`}
                    />
                    <Box>
                      {role === 'sender' && user.status === 'pending' ? (
                        <Tooltip title="Withdraw this invitation" placement="top">
                          <Button
                            variant="outlined"
                            color="secondary"
                            size="small"
                            onClick={() => handleWithdraw(user.user_id)}
                          >
                            Withdraw
                          </Button>
                        </Tooltip>
                      ) : role === 'receiver' && user.status === 'pending' ? (
                        <>
                          <Tooltip title="Accept this invitation" placement="top">
                            <Button
                              variant="outlined"
                              color="primary"
                              size="small"
                              onClick={() => handleAccept(user.user_id)}
                              sx={{ mr: 1 }}
                            >
                              Accept
                            </Button>
                          </Tooltip>
                          <Tooltip title="Reject this invitation" placement="top">
                            <Button
                              variant="outlined"
                              color="secondary"
                              size="small"
                              onClick={() => handleReject(user.user_id)}
                            >
                              Reject
                            </Button>
                          </Tooltip>
                        </>
                      ) : (
                        <StatusChip status={user.status} />
                      )}
                    </Box>
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box mt={4}>
        <Tooltip title="Save your collaboration details" placement="top">
          <Button
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            onClick={handleUpdateCollaboration}
            disabled={isLoading || !isEditing} // Disable if not in edit mode
            sx={{ py: 2, fontSize: '1.1rem', borderRadius: 100 }}
          >
            {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Update Collaboration'}
          </Button>
        </Tooltip>
      </Box>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

const StatusChip = ({ status }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted':
        return { dot: alpha('#4caf50', 1.0), bg: alpha('#c8e6c9', 0.5) }; // Green
      case 'withdrawn':
        return { dot: alpha('#ff9800', 1.0), bg: alpha('#ffe0b2', 0.5) }; // Orange
      case 'rejected':
        return { dot: alpha('#f44336', 1.0), bg: alpha('#ffcdd2', 0.5) }; // Red
      default:
        return { dot: alpha('#1976d2', 1.0), bg: alpha('#bbdefb', 0.5) }; // Blue
    }
  };

  const { dot, bg } = getStatusColor(status);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: bg,
        borderRadius: 10,
        padding: '4px 8px',
        marginLeft: 1,
      }}
    >
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '100%',
          backgroundColor: dot,
          marginRight: 1,
        }}
      />
      <Typography variant="body2" color={dot}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Typography>
    </Box>
  );
};

export default CollaborationDetails;
