import React, { useState } from 'react';
import { Container, Grid, TextField, Button, Typography, Card, CardContent, CardActions } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';

function SearchPage() {
  const [phenotype, setPhenotype] = useState('');
  const [minSamples, setMinSamples] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isRequestSent, setIsRequestSent] = useState({});

  const handleSendRequest = (id) => {
    console.log(`Sending collaboration request to ${id}`);
    setIsRequestSent((prev) => ({ ...prev, [id]: true }));
  };

  const handleSearch = () => {
    const dummyResults = [
      { id: 1, name: 'Dr. John Doe', field: 'Lactose Intolerance', samples: 50 },
      { id: 2, name: 'Prof. Jane Smith', field: 'Lactose Intolerance', samples: 70 },
      { id: 3, name: 'Dr. Alice Johnson', field: 'Lactose Intolerance', samples: 90 },
    ];
    setSearchResults(dummyResults);
    setIsRequestSent({});
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
            {searchResults.map(result => (
              <Grid item xs={12} sm={6} md={4} key={result.id}>
                <Card sx={{ borderRadius: 2, boxShadow: 'none', border: '1px solid #ddd' }}>
                  <CardContent>
                    <Typography variant="h6" component="div">
                      {result.name}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Field: {result.field}
                    </Typography>
                    {/* <Typography variant="body2" color="textSecondary">
                      Location: {result.location}
                    </Typography> */}
                    <Typography variant="body2" color="textSecondary">
                      Samples: {result.samples}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => handleSendRequest(result.id)}
                      disabled={isRequestSent[result.id]}
                      fullWidth
                    >
                      {isRequestSent[result.id] ? 'Invitation Sent' : 'Send Collaboration Invite'}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </Container>
  );
}

export default SearchPage;
