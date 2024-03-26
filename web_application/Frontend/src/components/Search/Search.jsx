import React from 'react';
import { Container, Grid, TextField, Button, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

function SearchPage() {
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
          />
          <TextField
            fullWidth
            label="Minimum # of Samples"
            variant="outlined"
            margin="normal"
            sx={{ marginBottom: 2 }}
          />
          <Button
            variant="contained"
            color="primary"
            startIcon={<SearchIcon />}
            fullWidth
          >
            Search For Collaborator
          </Button>
        </Grid>
        <Grid item xs={12} md={6}>
          <Typography variant="h6" align="center" gutterBottom>
            Search Results
          </Typography>
          {/* Placeholder for search results */}
        </Grid>
      </Grid>
    </Container>
  );
}

export default SearchPage;
