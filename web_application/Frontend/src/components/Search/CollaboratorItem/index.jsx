import React, { useState } from 'react';
import { ListItem, ListItemText, Button, Grid, Snackbar } from '@mui/material';
import CollaborationRequestButton from '../CollaborationRequestButton';

const CollaboratorItem = ({ collaborator }) => {
  const { id, name, skills, metadata } = collaborator;
  
  const [isRequestSent, setIsRequestSent] = useState(false); // State to manage visibility of the message

  const handleSendRequest = () => {
    // Implement the functionality to send a collaboration request
    console.log(`Sending collaboration request to ${name}`);
    
    // Update state to show the message
    setIsRequestSent(true);
  };

  const handleCloseSnackbar = () => {
    // Close the Snackbar
    setIsRequestSent(false);
  };

  return (
    <ListItem key={id}>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={6}>
          <ListItemText 
            primary={name} 
            secondary={`Skills: ${skills.join(', ')}`}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <ListItemText 
            primary={`Metadata: ${metadata}`} 
          />
        </Grid>
        <Grid item xs={12} sm={2}>
          <CollaborationRequestButton onClick={handleSendRequest} />
        </Grid>
      </Grid>
      <Snackbar 
        open={isRequestSent} 
        autoHideDuration={3000} 
        onClose={handleCloseSnackbar}
        message="Request sent successfully" 
      />
    </ListItem>
  );
};

export default CollaboratorItem;
