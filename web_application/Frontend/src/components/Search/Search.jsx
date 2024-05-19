import React, { useState } from 'react';
import { Container, Grid, TextField, Button, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import axios from 'axios';

function SearchPage() {
  // State variables to store search parameters and results
  const [phenotype, setPhenotype] = useState('');
  const [minSamples, setMinSamples] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isRequestSent, setIsRequestSent] = useState(false);

  const handleSendRequest = () => {
    // Implement the functionality to send a collaboration request
    console.log(`Sending collaboration request to ${_id}`);
    
    // Update state to show the message
    setIsRequestSent(true);
  };

  // Function to handle search button click
  const handleSearch = () => {
    // Make Axios request here
    axios.get(`https://ubiquitous-space-potato-q77r667x74qx29vvr-5000.app.github.dev/api/researchprojects`, {
      params: {
        phenotype: phenotype,
        minSamples: minSamples
      }
    })
      .then(response => {
        setSearchResults(response.data); // Update search results state with response data
      })
      .catch(error => {
        console.error('Error fetching data:', error);
        // Handle error, e.g., show error message to user
      });
  };
  
  return (
    <Container component="div" maxWidth="md" sx={{ marginTop: 4 }}>
      <Grid container spacing={3} alignItems="center" justifyContent="center">
        <Grid item xs={12}>
          <Typography variant="h5" align="center" gutterBottom>
            Initiator Search
          </Typography>
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Phenotype(s)"
            variant="outlined"
            margin="normal"
            sx={{ marginBottom: 2 }}
            value={phenotype}
            onChange={(e) => setPhenotype(e.target.value)}
          />
          <TextField
            fullWidth
            label="Minimum # of Samples"
            variant="outlined"
            margin="normal"
            sx={{ marginBottom: 2 }}
            value={minSamples}
            onChange={(e) => setMinSamples(e.target.value)}
          />
          <Button
            variant="contained"
            color="primary"
            startIcon={<SearchIcon />}
            fullWidth
            onClick={handleSearch} // Call handleSearch function on button click
          >
            Search For Collaborator
          </Button>
        </Grid>
        <Grid item xs={12} md={6} >
          <Typography variant="h6" align="center" gutterBottom>
            Search Results
          </Typography>
          {/* Display search results here */}
          <ul>
            {searchResults.map(result => (
              <li key={result.id}>{result.name}</li>
            ))}
          </ul>
        </Grid>
      </Grid>
    </Container>
  );
}

export default SearchPage;
