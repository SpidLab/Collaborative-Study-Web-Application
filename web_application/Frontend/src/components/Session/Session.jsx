import React, { useState } from 'react';
import { Container, Grid, FormGroup, FormControlLabel, Button, Typography, Checkbox } from '@mui/material';

function CreateSession() {
  const [checked1, setChecked1] = useState(true);
  const handleChange1 = (e) => {
    setChecked1(event.target.checked);
  };

  const [checked2, setChecked2] = useState(true);
  const handleChange2 = (e) => {
    setChecked2(event.target.checked);
  };
  const [checked3, setChecked3] = useState(true);
  const handleChange3 = (e) => {
    setChecked2(event.target.checked);
  };

  return (
    <Container component="div" maxWidth="md" sx={{ marginTop: 4 }}>
      <Grid container spacing={3} alignItems="center" justifyContent="center">
        <Grid item xs={12}>
          <Typography variant="h5" align="center" gutterBottom>
            Session ID
          </Typography>
        </Grid>
        <Grid item xs={12} md={6}>
        
          <FormGroup>
            <FormControlLabel
              control={<Checkbox checked1={checked1} onChange={handleChange1} />}
              label="Sample Relatedness"
            />
          </FormGroup>
          {" "}
          <FormGroup>
            <FormControlLabel
              control={<Checkbox checked2={checked2} onChange={handleChange2} />}
              label="Gene Expression"
            />
          </FormGroup>
          {" "}
          <FormGroup>
            <FormControlLabel
              control={<Checkbox checked3={checked3} onChange={handleChange3} />}
              label="Rare Variants"
            />
          </FormGroup>
          
          <Button
            variant="contained"
            color="primary"
            fullWidth
          >
            Create Session
          </Button>
        </Grid>
        <Grid item xs={12} md={6}>
          <Typography variant="h6" align="center" gutterBottom>
            Search Results
          </Typography>
          {/* Placeholder for search results */}
          <Button
            variant="contained"
            color="primary"
            halfWidth
          >
            View Results
          </Button>
        </Grid>
      </Grid>
    </Container>
  );
}

export default CreateSession;
