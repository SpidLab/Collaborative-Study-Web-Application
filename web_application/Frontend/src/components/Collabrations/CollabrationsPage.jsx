import React, { useState, useEffect } from 'react';
import { Container, Typography, List, ListItem, ListItemText, Button, Box, ListItemSecondaryAction, Snackbar, Paper, Alert } from '@mui/material';
import axios from 'axios';
import URL from '../../config';

const getToken = () => {
  return localStorage.getItem('token');
};

const UserInvitation = ({ invitation, onAccept, onReject, currentUserId }) => {
  const [status, setStatus] = useState(invitation.status);

  const handleAccept = () => {
    onAccept(invitation._id, invitation.receiver_id, invitation.sender_id);
    setStatus('accepted');
  };

  const handleReject = () => {
    onReject(invitation._id, invitation.receiver_id, invitation.sender_id);
    setStatus('rejected');
  };

  const displayEmail = () => {
    if (currentUserId === invitation.receiver_id) {
      return `${invitation.sender_email}`;
    } else if (currentUserId === invitation.sender_id) {
      return `${invitation.receiver_email}`;
    }
    return '';
  };

  return (
    <ListItem sx={{ borderBottom: '1px solid #ddd', padding: 2 }}>
      <ListItemText primary={displayEmail()} secondary={`Status: ${status}`} />
      {invitation.receiver_id === currentUserId && status === 'pending' && (
        <ListItemSecondaryAction>
          <Button variant="contained" color="primary" size="small" sx={{ mr: 1 }} onClick={handleAccept}>
            Accept
          </Button>
          <Button variant="contained" color="secondary" size="small" onClick={handleReject}>
            Reject
          </Button>
        </ListItemSecondaryAction>
      )}
    </ListItem>
  );
};

const CollaborationsPage = () => {
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [acceptedInvitations, setAcceptedInvitations] = useState([]);
  const [sentInvitations, setSentInvitations] = useState([]);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    const fetchInvitations = async () => {
      const token = getToken();
      console.log('Fetching invitations with token:', token);

      try {
        const response = await axios.get(`${URL}/api/invitations`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        console.log('Fetched invitations data:', response.data);

        const { user_id, invitations } = response.data;
        const pending = invitations.filter(invitation => invitation.status === 'pending');
        const accepted = invitations.filter(invitation => invitation.status === 'accepted');
        const sent = invitations.filter(invitation => invitation.status === 'sent');

        setCurrentUserId(user_id);
        setPendingInvitations(pending);
        setAcceptedInvitations(accepted);
        setSentInvitations(sent);
      } catch (error) {
        console.error('Error fetching invitations:', error);
        setError('Failed to fetch invitations');
      }
    };

    fetchInvitations();
  }, []);

  const handleAccept = async (invitationId, receiverId, senderId) => {
    const token = getToken();
    console.log('Accept Invitation Data:', {
      receiver_id: receiverId,
      sender_id: senderId
    });

    try {
      const response = await axios.post(`${URL}/api/acceptinvitation`, {
        receiver_id: receiverId,
        sender_id: senderId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 200) {
        setMessage('Accepted Request');
        setOpenSnackbar(true);
        setPendingInvitations(prev => prev.filter(invitation => invitation._id !== invitationId));
        const acceptedInvitation = pendingInvitations.find(inv => inv._id === invitationId);
        setAcceptedInvitations(prev => [...prev, { ...acceptedInvitation, status: 'accepted' }]);
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setMessage('Failed to accept request');
      setOpenSnackbar(true);
    }
  };

  const handleReject = async (invitationId, receiverId, senderId) => {
    const token = getToken();
    console.log('Reject Invitation Data:', {
      receiver_id: receiverId,
      sender_id: senderId
    });

    try {
      const response = await axios.post(`${URL}/api/rejectinvitation`, {
        receiver_id: receiverId,
        sender_id: senderId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 200) {
        setMessage('Rejected Request');
        setOpenSnackbar(true);
        setPendingInvitations(prev => prev.filter(invitation => invitation._id !== invitationId));
      }
    } catch (error) {
      console.error('Error rejecting invitation:', error);
      setMessage('Failed to reject request');
      setOpenSnackbar(true);
    }
  };

  const handleCloseSnackbar = () => {
    setOpenSnackbar(false);
  };

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  return (
    <Container component="div" maxWidth="md" sx={{ marginTop: 4 }}>
      <Typography variant="h5" align="center" gutterBottom>
        All Collaborations
      </Typography>
      <List>
        {pendingInvitations.map((invitation) => (
          <UserInvitation key={invitation._id} invitation={invitation} onAccept={handleAccept} onReject={handleReject} currentUserId={currentUserId} />
        ))}
      </List>

      {acceptedInvitations.length > 0 && (
        <Box sx={{ marginTop: 4 }}>
          <Typography variant="h6">Collaborations</Typography>
          <List>
            {acceptedInvitations.map((invitation) => (
              <ListItem key={invitation._id} sx={{ borderBottom: '1px solid #ddd', padding: 2 }}>
                <ListItemText primary={`${invitation.sender_email} & ${invitation.receiver_email}`} />
                <Button variant="contained" color="primary" size="small">
                  Create a Session
                </Button>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      <Snackbar open={openSnackbar} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity="success" sx={{ width: '100%' }}>
          {message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default CollaborationsPage;








// import React, { useState } from 'react';
// import { Container, Typography, List, ListItem, ListItemText, Button, Box, ListItemSecondaryAction, Snackbar, Paper } from '@mui/material';
// import { Link } from 'react-router-dom'; // Import Link from react-router-dom

// const userInvitations = [
//   { id: 1, name: 'Dr. Emily Davis' },
//   { id: 2, name: 'Prof. Matthew Wilson' },
//   { id: 3, name: 'Prof. David Brown' },
// ];

// const UserInvitation = ({ user, onAccept, onReject }) => {
//   const [status, setStatus] = useState(null); // null, 'accepted', or 'rejected'

//   const handleAccept = () => {
//     setStatus('accepted');
//     onAccept(user.name);
//   };

//   const handleReject = () => {
//     setStatus('rejected');
//     onReject(user.name);
//   };

//   return (
//     <ListItem sx={{ borderBottom: '1px solid #ddd', padding: 2 }}>
//       <ListItemText primary={user.name} />
//       <ListItemSecondaryAction>
//         {status === 'accepted' ? (
//           <Button variant="contained" color="primary" size="small">
//             Create a session
//           </Button>
//         ) : status === 'rejected' ? (
//           <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 'bold', display: 'inline-block', backgroundColor: '#f8d7da', padding: '6px 12px', borderRadius: 2 }}>
//             Rejected
//           </Typography>
//         ) : (
//           <>
//             <Button variant="contained" color="primary" size="small" sx={{ mr: 1 }} onClick={handleAccept}>
//               Accept
//             </Button>
//             <Button variant="contained" color="secondary" size="small" onClick={handleReject}>
//               Reject
//             </Button>
//           </>
//         )}
//       </ListItemSecondaryAction>
//     </ListItem>
//   );
// };

// const CollaborationsPage = () => {
//   const [message, setMessage] = useState('');
//   const [snackbarOpen, setSnackbarOpen] = useState(false);

//   const handleAccept = (userName) => {
//     setMessage(`You have accepted the invitation from ${userName}.`);
//     setSnackbarOpen(true);
//   };

//   const handleReject = (userName) => {
//     setMessage(`You have rejected the invitation from ${userName}.`);
//     setSnackbarOpen(true);
//   };

//   const handleSnackbarClose = () => {
//     setSnackbarOpen(false);
//   };

//   // Mock collaborations data
//   const collaborations = [
//     { id: 1, status: 'Pending Accept', metadata: 'Combined PCA' },
//     { id: 2, status: 'Ready to Collaborate', metadata: 'Sample Relatedness' },
//     { id: 3, status: 'Done', metadata: 'Gene Expression' },
//     // Add more mock collaborations as needed
//   ];

//   return (
//     <Container component="div" maxWidth="md" sx={{ marginTop: 4 }}>
//       <Typography variant="h5" align="center" gutterBottom>
//         All Collaborations
//       </Typography>
//       <List>
//         {collaborations.map((collaboration) => (
//           <ListItem key={collaboration.id} sx={{ borderBottom: '1px solid #ddd', padding: 2 }}>
//             <ListItemText 
//               primary={collaboration.metadata} 
//               secondary={`Status: ${collaboration.status}`}
//             />
//             <Button variant="contained" color="primary" component={Link} to={`/collaboration/${collaboration.id}`}>
//               View Details
//             </Button>
//           </ListItem>
//         ))}
//       </List>
      
//       <Box sx={{ textAlign: 'center', mt: 4 }}>
//         <Typography variant="h5" align="center" gutterBottom>
//           Collaboration Invitations
//         </Typography>
//         <Paper sx={{ borderRadius: 2, boxShadow: 'none' }}>
//           <List>
//             {userInvitations.map((user) => (
//               <UserInvitation key={user.id} user={user} onAccept={handleAccept} onReject={handleReject} />
//             ))}
//           </List>
//         </Paper>
//       </Box>
      
//       <Snackbar
//         open={snackbarOpen}
//         autoHideDuration={6000}
//         onClose={handleSnackbarClose}
//         message={message}
//       />
//     </Container>
//   );
// };

// export default CollaborationsPage;
