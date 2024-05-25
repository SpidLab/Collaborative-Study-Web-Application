import React, { useState } from 'react';
import { Container, Typography, List, ListItem, ListItemText, Button, Box, ListItemSecondaryAction, Snackbar, Paper } from '@mui/material';
import { Link } from 'react-router-dom'; // Import Link from react-router-dom

const userInvitations = [
  { id: 1, name: 'Dr. Emily Davis' },
  { id: 2, name: 'Prof. Matthew Wilson' },
  { id: 3, name: 'Prof. David Brown' },
];

const UserInvitation = ({ user, onAccept, onReject }) => {
  const [status, setStatus] = useState(null); // null, 'accepted', or 'rejected'

  const handleAccept = () => {
    setStatus('accepted');
    onAccept(user.name);
  };

  const handleReject = () => {
    setStatus('rejected');
    onReject(user.name);
  };

  return (
    <ListItem sx={{ borderBottom: '1px solid #ddd', padding: 2 }}>
      <ListItemText primary={user.name} />
      <ListItemSecondaryAction>
        {status === 'accepted' ? (
          <Button variant="contained" color="primary" size="small">
            Create a session
          </Button>
        ) : status === 'rejected' ? (
          <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 'bold', display: 'inline-block', backgroundColor: '#f8d7da', padding: '6px 12px', borderRadius: 2 }}>
            Rejected
          </Typography>
        ) : (
          <>
            <Button variant="contained" color="primary" size="small" sx={{ mr: 1 }} onClick={handleAccept}>
              Accept
            </Button>
            <Button variant="contained" color="secondary" size="small" onClick={handleReject}>
              Reject
            </Button>
          </>
        )}
      </ListItemSecondaryAction>
    </ListItem>
  );
};

const CollaborationsPage = () => {
  const [message, setMessage] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const handleAccept = (userName) => {
    setMessage(`You have accepted the invitation from ${userName}.`);
    setSnackbarOpen(true);
  };

  const handleReject = (userName) => {
    setMessage(`You have rejected the invitation from ${userName}.`);
    setSnackbarOpen(true);
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  // Mock collaborations data
  const collaborations = [
    { id: 1, status: 'Pending Accept', metadata: 'Combined PCA' },
    { id: 2, status: 'Ready to Collaborate', metadata: 'Sample Relatedness' },
    { id: 3, status: 'Done', metadata: 'Gene Expression' },
    // Add more mock collaborations as needed
  ];

  return (
    <Container component="div" maxWidth="md" sx={{ marginTop: 4 }}>
      <Typography variant="h5" align="center" gutterBottom>
        All Collaborations
      </Typography>
      <List>
        {collaborations.map((collaboration) => (
          <ListItem key={collaboration.id} sx={{ borderBottom: '1px solid #ddd', padding: 2 }}>
            <ListItemText 
              primary={collaboration.metadata} 
              secondary={`Status: ${collaboration.status}`}
            />
            <Button variant="contained" color="primary" component={Link} to={`/collaboration/${collaboration.id}`}>
              View Details
            </Button>
          </ListItem>
        ))}
      </List>
      
      <Box sx={{ textAlign: 'center', mt: 4 }}>
        <Typography variant="h5" align="center" gutterBottom>
          Collaboration Invitations
        </Typography>
        <Paper sx={{ borderRadius: 2, boxShadow: 'none' }}>
          <List>
            {userInvitations.map((user) => (
              <UserInvitation key={user.id} user={user} onAccept={handleAccept} onReject={handleReject} />
            ))}
          </List>
        </Paper>
      </Box>
      
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        message={message}
      />
    </Container>
  );
};

export default CollaborationsPage;
