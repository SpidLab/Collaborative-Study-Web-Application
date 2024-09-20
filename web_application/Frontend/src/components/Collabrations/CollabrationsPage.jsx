import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Typography, List, ListItem, ListItemText, Button, Box, ListItemSecondaryAction, Snackbar, Paper, Alert } from '@mui/material';
import axios from 'axios';
import URL from '../../config';

const getToken = () => {
  return localStorage.getItem('token');
};

const UserInvitation = ({ invitation, onAccept, onReject, currentUserId, onWithdraw, onCancel }) => {
  const [status, setStatus] = useState(invitation.status);

  const handleAccept = () => {
    onAccept(invitation._id, invitation.receiver_id, invitation.sender_id, invitation.uuid);
    setStatus('accepted');
  };

  const handleReject = () => {
    onReject(invitation._id, invitation.receiver_id, invitation.sender_id, invitation.uuid);
    setStatus('rejected');
  };
  const handleWithdraw = () => {
    onWithdraw(invitation._id, invitation.receiver_id, invitation.sender_id, invitation.uuid);
    setStatus('withdrawn');
  };
  const handleCancel = () => {
    onCancel(invitation._id, invitation.receiver_id, invitation.sender_id, invitation.uuid);
    setStatus('cancelled');
  };

  const displayEmail = () => {
    if (currentUserId === invitation.receiver_id) {
      return `${invitation.sender_name}`;
    } else if (currentUserId === invitation.sender_id) {
      return `${invitation.receiver_name}`;
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
      {invitation.sender_id === currentUserId && invitation.receiver_id !== currentUserId && (
        <ListItemSecondaryAction>
          <Button variant="contained" color="secondary" size="small" onClick={handleWithdraw}>
            Withdraw
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
  const navigate = useNavigate();


  useEffect(() => {
    const fetchInvitations = async () => {
      const token = getToken();

      try {
        const response = await axios.get(`${URL}/api/invitations`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const { user_id, invitations } = response.data;
        const pending = invitations
          .filter(invitation => invitation.status === 'pending')
          .map(invitation => ({
            ...invitation,
            uuid: invitation.uuid
          }));

        const accepted = invitations
          .filter(invitation => invitation.status === 'accepted')
          .map(invitation => ({
            ...invitation,
            uuid: invitation.uuid
          }));

        const sent = invitations
          .filter(invitation => invitation.status === 'sent')
          .map(invitation => ({
            ...invitation,
            uuid: invitation.uuid
          }));

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


  const handleWithdraw = async (invitationId, receiverId, senderId, uuid) => {
    const token = getToken();
    try {
      const response = await axios.post(`${URL}/api/withdrawinvitation`, {
        uuid: uuid,
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 200) {
        setMessage('Request Withdrawn');
        setOpenSnackbar(true);
        setPendingInvitations(prev => prev.filter(invitation => invitation._id !== invitationId));
      }
    } catch (error) {
      console.error('Error withdrawing invitation:', error.response ? error.response.data.message : error.message);
    }
  };

  const handleAccept = async (invitationId, receiverId, senderId, uuid) => {
    const token = getToken();
    console.log('Accept Invitation Data:', {
      receiver_id: receiverId,
      sender_id: senderId
    });

    try {
      const response = await axios.post(`${URL}/api/acceptinvitation`, {
        uuid: uuid,
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

  const handleReject = async (invitationId, receiverId, senderId, uuid) => {
    const token = getToken();
    try {
      const response = await axios.post(`${URL}/api/rejectinvitation`, {
        uuid: uuid,
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

  const handleCancel = async (invitationId, uuid) => {
    const token = getToken();
    console.log('UUID:', uuid);
    try {
      const response = await axios.post(`${URL}/api/cancelinvitation`, {
        uuid: uuid,
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 200) {
        setMessage('Invitation Cancelled');
        setOpenSnackbar(true);
        setPendingInvitations(prev => prev.filter(invitation => invitation._id !== invitationId));
      }
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      setMessage('Failed to cancel request');
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
      <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'light' }}>
        All Collaborations
      </Typography>
      <List>
        {pendingInvitations.map((invitation) => (
          <UserInvitation key={invitation._id} invitation={invitation} onAccept={handleAccept} onReject={handleReject} onWithdraw={handleWithdraw} onCancel={handleCancel} currentUserId={currentUserId} />
        ))}
      </List>

      {acceptedInvitations.length > 0 && (
        <Box sx={{ marginTop: 4 }}>
          <Typography variant="h6">Collaborations In Process</Typography>
          <List>
            {acceptedInvitations.map((invitation) => (
              <ListItem key={invitation._id} sx={{ borderBottom: '1px solid #ddd', padding: 2 }}>
                <ListItemText
                  primary={
                    <React.Fragment>
                      <Typography variant="body1" component="div">
                        Phenotype: {invitation.phenotype}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Collaboration between {invitation.sender_name} & {invitation.receiver_name}
                      </Typography>
                    </React.Fragment>
                  }
                />
                {invitation.sender_id === currentUserId && (
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    onClick={() => navigate('/session')}
                  >
                    Create a Session
                  </Button>
                )} {invitation.receiver_id === currentUserId && (
                  <Button
                    variant="outlined"
                    color="primary"
                    size="small"
                    onClick={() => handleCancel(invitation._id, invitation.uuid)}
                  >
                    Revoke Invitation
                  </Button>
                )}
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