import React, { useState, useEffect } from 'react';
import { Container, Grid, TextField, Button, Typography, Card, CardContent, CardActions, Checkbox, FormControlLabel } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';
import URL from '../../config';

function SearchPage({ onUserSelect }) {
  const [phenotype, setPhenotype] = useState('');
  const [minSamples, setMinSamples] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState({});

  const getToken = () => {
    return localStorage.getItem('token');
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
      setSelectedUsers({}); // Reset selected users
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleUserSelect = (userId) => {
    setSelectedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId], // Toggle selection
    }));
  };

  // Pass the selected users to the parent only when selectedUsers or searchResults change.
  useEffect(() => {
    if (searchResults.length > 0) {
      const selectedUsersList = searchResults.filter(user => selectedUsers[user._id]);
      onUserSelect(selectedUsersList);
    }
  }, [selectedUsers, searchResults, onUserSelect]);

  return (
    <Container component="div" maxWidth="lg" sx={{ borderRadius: 2 }}>
      <Grid container spacing={3} alignItems="center" justifyContent="center">
        <Grid item xs={12}>
          {/* <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'light' }}>
            Search Collaborators
          </Typography> */}
        </Grid>
        <Grid item xs={4} sm={4}>
          <TextField
            fullWidth
            label="Phenotype(s)"
            variant="outlined"
            value={phenotype}
            onChange={(e) => setPhenotype(e.target.value)}
            sx={{ marginBottom: 2 }}
          />
        </Grid>
        <Grid item xs={4} sm={4}>
          <TextField
            fullWidth
            label="Minimum # of Samples"
            variant="outlined"
            value={minSamples}
            onChange={(e) => setMinSamples(e.target.value)}
            sx={{ marginBottom: 2 }}
          />
        </Grid>
        <Grid item xs={4} sm={4} md={4}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SearchIcon />}
            onClick={handleSearch}
            fullWidth
            sx={{ padding: 2, fontSize: '1rem', marginBottom:2 }}
          >
            Search
          </Button>
        </Grid>
        <Grid item xs={12}>
          <Grid container spacing={3}>
            {searchResults.length > 0 ? (
              searchResults.map((result) => (
                <Grid item xs={12} sm={6} md={4} key={result._id}>
                  <Card sx={{ borderRadius: 2, boxShadow: 'none', border: '1px solid #ddd' }}>
                    <CardContent>
                      <Typography variant="h6" component="div">
                        {result.name}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Phenotype: {result.phenotype}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Number of samples: {result.numberOfSamples}
                      </Typography>
                    </CardContent>
                    <CardActions>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={!!selectedUsers[result._id]}
                            onChange={() => handleUserSelect(result._id)}
                          />
                        }
                        label="Select for Collaboration"
                      />
                    </CardActions>
                  </Card>
                </Grid>
              ))
            ) : (
              <Typography variant="body1" color="textSecondary" sx={{ padding: 4 }}>
                No results found. Please refine your search.
              </Typography>
            )}
          </Grid>
        </Grid>
      </Grid>
    </Container>
  );
}

export default SearchPage;


