import React from 'react';
import { Container, Typography, Button, Grid } from '@mui/material';
import { useParams } from 'react-router-dom'; // Import useParams from react-router-dom

const CollaborationDetailsPage = () => {
  const { id } = useParams(); // Get the collaboration ID from the URL parameters
  
  // Mock collaboration data
  const collaboration = {
    id: parseInt(id, 10), // Convert id to integer
    status: 'Pending Accept',
    metadata: 'Frontend Project',
  };

  const { status, metadata } = collaboration;

  const handleAccept = () => {
    // Implement the functionality to accept the collaboration
    console.log(`Accepted collaboration with ID: ${id}`);
  };

  const handleStartExperiment = () => {
    // Implement the functionality to start the experiment
    console.log(`Started experiment for collaboration with ID: ${id}`);
  };

  const handleOtherTrigger = () => {
    // Implement the functionality for other triggers
    console.log(`Triggered other action for collaboration with ID: ${id}`);
  };

  return (
    <Container component="div" maxWidth="md" sx={{ marginTop: 4 }}>
      <Typography variant="h5" align="center" gutterBottom>
        Collaboration Details
      </Typography>
      <Typography variant="h6" align="center" gutterBottom>
        Metadata: {metadata}
      </Typography>
      <Typography variant="subtitle1" align="center" gutterBottom>
        Status: {status}
      </Typography>
      <Grid container spacing={2} justifyContent="center">
        <Grid item>
          {status === 'Pending Accept' && (
            <Button variant="contained" color="primary" onClick={handleAccept}>
              Accept
            </Button>
          )}
          {status === 'Ready to Collaborate' && (
            <Button variant="contained" color="primary" onClick={handleStartExperiment}>
              Start Experiment
            </Button>
          )}
          <Button variant="outlined" color="secondary" onClick={handleOtherTrigger}>
            Other Trigger
          </Button>
        </Grid>
      </Grid>
    </Container>
  );
};

export default CollaborationDetailsPage;
