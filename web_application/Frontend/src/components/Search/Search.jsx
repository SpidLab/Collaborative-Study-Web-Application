import React, { useState, useEffect } from 'react';
import { Container, Grid, TextField, Button, Typography, Card, CardContent, CardActions, Snackbar, Alert } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';
import URL from '../../config';

function SearchPage() {
  const [phenotype, setPhenotype] = useState('');
  const [minSamples, setMinSamples] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isRequestSent, setIsRequestSent] = useState({});
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);

  const getToken = () => {
    return localStorage.getItem('token');
  };

  const checkInvitationStatus = async (receiverId) => {
    const token = getToken();
    const senderId = localStorage.getItem('userId');

    const requestData = {
      receiver_id: receiverId,
      sender_id: senderId,
    };

    try {
      const response = await fetch(`${URL}/api/checkinvitationstatus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      if (data.status) {
        setIsRequestSent((prev) => ({ ...prev, [receiverId]: data.status }));
      }
    } catch (error) {
      console.error('There was a problem checking the invitation status:', error);
    }
  };

  const handleSendRequest = async (receiverId) => {
    const token = getToken();
    const senderId = localStorage.getItem('userId');

    const requestData = {
      receiver_id: receiverId,
      sender_id: senderId,
    };

    try {
      const response = await fetch(`${URL}/api/sendinvitation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      setMessage(data.message);
      setOpen(true);
      if (data.message === 'Invitation sent successfully' || data.message === 'Invitation already sent') {
        setIsRequestSent((prev) => ({ ...prev, [receiverId]: 'pending' }));
      }
    } catch (error) {
      setMessage('There was a problem sending the invitation');
      setOpen(true);
      console.error('There was a problem sending the invitation:', error);
    }
  };

  const handleSearch = async () => {
    try {
      const token = getToken();
      if (!token) {
        return;
      }

      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          phenotype: phenotype,
          minSamples: minSamples,
        },
      };

      const response = await axios.get(`${URL}/api/invite/users`, config);
      const results = response.data;
      setSearchResults(results);

      // Check invitation status for each search result
      results.forEach(result => {
        checkInvitationStatus(result._id);
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Container component="div" maxWidth="lg" sx={{ padding: 4, borderRadius: 2 }}>
      <Grid container spacing={3} alignItems="center" justifyContent="center">
        <Grid item xs={12}>
          <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'bold' }}>
            Search Collaborators
          </Typography>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Phenotype(s)"
            variant="outlined"
            value={phenotype}
            onChange={(e) => setPhenotype(e.target.value)}
            sx={{ marginBottom: 2 }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Minimum # of Samples"
            variant="outlined"
            value={minSamples}
            onChange={(e) => setMinSamples(e.target.value)}
            sx={{ marginBottom: 2 }}
          />
        </Grid>
        <Grid item xs={12} sm={12} md={12}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SearchIcon />}
            onClick={handleSearch}
            fullWidth
            sx={{ padding: 2, fontSize: '1rem' }}
          >
            Search
          </Button>
        </Grid>
        <Grid item xs={12}>
          <Typography variant="h6" align="center" gutterBottom sx={{ marginTop: 4 }}>
            Search Results
          </Typography>
          <Grid container spacing={3}>
            {searchResults.map((result) => (
              <Grid item xs={12} sm={6} md={4} key={result._id}>
                <Card sx={{ borderRadius: 2, boxShadow: 'none', border: '1px solid #ddd' }}>
                  <CardContent>
                    <Typography variant="h6" component="div">
                      {result.email}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Phenotype: {result.phenotype}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Number of samples: {result.numberOfSamples}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      variant="contained"
                      color="primary"

                      onClick={() => handleSendRequest(result._id)}
                      disabled={isRequestSent[result._id] === 'pending' || isRequestSent[result._id] === 'rejected'}
                      fullWidth
                    >
                      {isRequestSent[result._id] === 'pending' ? 'Invitation Sent' :
                        isRequestSent[result._id] === 'accepted' ? 'Invitation Accepted' :
                          isRequestSent[result._id] === 'rejected' ? 'Invitation Rejected' : 'Send Collaboration Invite'}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
      <Snackbar open={open} autoHideDuration={6000} onClose={handleClose}>
        <Alert onClose={handleClose} severity="success" sx={{ width: '100%' }}>
          {message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

export default SearchPage;