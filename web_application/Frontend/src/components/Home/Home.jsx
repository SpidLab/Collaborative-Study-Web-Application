import React from 'react';
import { Button, Typography, Box, Grid, Paper } from '@mui/material';
import { Link } from 'react-router-dom';

const HomePage = () => {
  return (
    <Box sx={{ textAlign: 'center', mt: 10, margin:4}}>
      <Typography variant="h4" gutterBottom>
        Welcome to the app
      </Typography>
      <Grid container spacing={2} justifyContent="center">
        <Grid item xs={12}>
          {/* First block */}
          <Paper sx={{ p: 2, borderRadius:4 }}>
            <Box sx={{ border: '1px solid #ccc', p: 2 , height:200, borderRadius:4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h5" gutterBottom>
                Search
              </Typography>
              {/* Content for the first block */}
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={6}>
          {/* Second block */}
          <Paper sx={{ p: 2, borderRadius:4}}>
            <Box sx={{ border: '1px solid #ccc', p: 2 , height:200, borderRadius:4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h5" gutterBottom>
                Upload
              </Typography>
              {/* Content for the second block */}
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={6}>
          {/* Third block */}
          <Paper sx={{ p: 2 , borderRadius:4}}>
            <Box sx={{ border: '1px solid #ccc', p: 2 , height:200, borderRadius:4, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
              <Typography variant="h5" gutterBottom>
                Collabroration
              </Typography>
              {/* Content for the third block */}
            </Box>
          </Paper>
        </Grid>
      </Grid>
      {/* <Box sx={{ mt: 2 }}>
        <Button component={Link} to="/login" variant="contained" color="primary" sx={{ mr: 2 }}>
          Login
        </Button>
        <Button component={Link} to="/register" variant="contained" color="secondary">
          Register
        </Button>
      </Box> */}
    </Box>
  );
};

export default HomePage;
