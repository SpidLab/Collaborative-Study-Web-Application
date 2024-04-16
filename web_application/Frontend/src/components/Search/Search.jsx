import React from 'react';
import { Container, Grid, Typography, Button } from '@mui/material';
import SearchInput from './SearchInput';
import SearchResultList from './SearchResultList';

function SearchPage() {
  // Define search criteria state
  const [searchCriteria, setSearchCriteria] = React.useState(null);

  // Define search results state
  const [searchResults, setSearchResults] = React.useState([]);
  
  // Define loading state
  const [isLoading, setIsLoading] = React.useState(false);

  // Define search initiated state
  const [isSearchInitiated, setIsSearchInitiated] = React.useState(false);

  // Handle search
  const handleSearch = (criteria) => {
    // Update search criteria state
    setSearchCriteria(criteria);

    // Set search initiated to true
    setIsSearchInitiated(true);

    // Perform search (this will be implemented later)
    // For now, set isLoading to true to simulate loading
    setIsLoading(true);

    // Simulate search results (remove this in the final implementation)
    setTimeout(() => {
      const mockResults = [
        { 
          id: 1, 
          name: 'John Doe', 
          skills: ['React', 'Node.js'], 
          metadata: 'Frontend Developer' 
        },
        { 
          id: 2, 
          name: 'Jane Doe', 
          skills: ['Angular', 'Python'], 
          metadata: 'Backend Developer' 
        },
        // Add more mock results as needed
      ];
      setSearchResults(mockResults);
      setIsLoading(false);
    }, 2000);
  };

  // Handle reset search
  const handleResetSearch = () => {
    // Reset search criteria state
    setSearchCriteria(null);

    // Reset search results state
    setSearchResults([]);

    // Set search initiated to false
    setIsSearchInitiated(false);
  };

  return (
    <Container component="div" maxWidth="md" sx={{ marginTop: 4 }}>
      <Grid container spacing={3} alignItems="center" justifyContent="center">
        <Grid item xs={12}>
          <Typography variant="h5" align="center" gutterBottom>
            {isSearchInitiated ? 'List of Collaborators' : 'Find your Collaborators'}
          </Typography>
        </Grid>
        <Grid item xs={12} md={6}>
          <SearchInput onSearch={handleSearch} />
        </Grid>
        <Grid item xs={12} md={6}>
          {isSearchInitiated && (
            <>
              <Typography variant="h6" align="center" gutterBottom>
                Search Results
              </Typography>
              <SearchResultList collaborators={searchResults} isLoading={isLoading} />
              <Button variant="outlined" color="secondary" onClick={handleResetSearch}>
                Reset Search
              </Button>
            </>
          )}
        </Grid>
      </Grid>
    </Container>
  );
}

export default SearchPage;
