import React, { useState, useEffect } from 'react';
import { Button, Typography, Box, Grid, Snackbar } from '@mui/material';
import UploadForm from '../Upload/Upload';
import SearchPage from '../Search/Search';
import CollaborationsPage from '../Collabrations/CollabrationsPage';
import axios from 'axios';
import URL from '../../config';
import { ForkLeft } from '@mui/icons-material';

const HomePage = () => {
  const [message, setMessage] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getToken = () => localStorage.getItem('token');
  const token = getToken();

  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const response = await axios.get(`${URL}/api/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        setUserName(response.data.name);
        console.log(response.data.name);
      } catch (error) {
        setError('There was an error fetching the user name!');
        console.error('There was an error fetching the user name!', error);
      } finally {
        setLoading(false);
      }
    };

    if (token) { 
      fetchUserName();
    } else {
      setError('No token found.');
      setLoading(false);
    }
  }, [token]);

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', color: '#333', justifyContent: 'center', display: 'flex' }}>
        Welcome Back, {userName}
      </Typography>
      <Grid container spacing={4} justifyContent="center">
        {/* <Grid item xs={12}>
          <Box sx={{ border: '1px solid #ccc', p: 2, m: 2, borderRadius: 2 }}>
            <SearchPage />
          </Box>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Box sx={{ border: '1px solid #ccc', p: 2, m: 2, borderRadius: 2, height: '550px', overflow: 'auto' }}>
            <UploadForm />
          </Box>
        </Grid> */}
        <Grid item xs={12} sm={12}>
          <Box sx={{ borderRadius: 2, overflow: 'auto' }}>
            <CollaborationsPage />
          </Box>
        </Grid>
      </Grid>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        message={message}
      />
    </Box>
  );
};

export default HomePage;
