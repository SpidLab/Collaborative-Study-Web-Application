import React from 'react';
import { Container, Typography, List, ListItem, ListItemText, Button } from '@mui/material';
import { Link } from 'react-router-dom'; // Import Link from react-router-dom

const CollaborationsPage = () => {
  // Mock collaborations data
  const collaborations = [
    { id: 1, status: 'Pending Accept', metadata: 'Frontend Project' },
    { id: 2, status: 'Ready to Collaborate', metadata: 'Backend Project' },
    { id: 3, status: 'Done', metadata: 'Research Experiment' },
    // Add more mock collaborations as needed
  ];

  return (
    <Container component="div" maxWidth="md" sx={{ marginTop: 4 }}>
      <Typography variant="h5" align="center" gutterBottom>
        All Collaborations
      </Typography>
      <List>
        {collaborations.map((collaboration) => (
          <ListItem key={collaboration.id}>
            <ListItemText 
              primary={collaboration.metadata} 
              secondary={`Status: ${collaboration.status}`}
            />
            {/* Use Link to navigate to CollaborationDetailsPage with the corresponding collaboration ID */}
            <Button variant="contained" color="primary" component={Link} to={`/collaboration/${collaboration.id}`}>
              View Details
            </Button>
          </ListItem>
        ))}
      </List>
    </Container>
  );
};

export default CollaborationsPage;
