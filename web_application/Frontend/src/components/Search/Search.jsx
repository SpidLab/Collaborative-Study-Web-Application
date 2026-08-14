import React, { useState, useEffect } from 'react';
import {
  Alert, Button, Card, CardActions, CardContent, Checkbox, Chip, CircularProgress,
  Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid,
  Snackbar, Stack, TextField, Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import axios from 'axios';
import URL from '../../config';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const REQUEST_STATUS = {
  pending: { label: 'Requested — pending', color: 'warning' },
  approved: { label: 'Approved', color: 'info' },
  transforming: { label: 'Approved — preparing copy', color: 'info' },
  ready: { label: 'Ready to download', color: 'success' },
  denied: { label: 'Denied', color: 'default' },
  failed: { label: 'Transform failed', color: 'error' },
  open: { label: 'Request already open', color: 'warning' },
};

function SearchPage({ onUserSelect, resetTrigger }) {
  const [phenotype, setPhenotype] = useState('');
  const [minSamples, setMinSamples] = useState('');
  const [name, setName] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedDatasets, setSelectedDatasets] = useState({});
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [requestTarget, setRequestTarget] = useState(null);
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const handleSearch = async () => {
    if (!localStorage.getItem('token')) {
      setSearchError('You are not signed in. Please log in again.');
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const response = await axios.get(`${URL}/api/invite/users`, {
        headers: authHeader(),
        params: { phenotype, minSamples, name },
      });
      setSearchResults(Array.isArray(response.data) ? response.data : []);
      setSelectedDatasets({});
    } catch (error) {
      setSearchError(error?.response?.data?.error || error.message || 'Search failed.');
      setSearchResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const handleDatasetSelect = (datasetId) => {
    setSelectedDatasets((prev) => ({
      ...prev,
      [datasetId]: !prev[datasetId],
    }));
  };

  const openRequest = (result) => {
    setRequestTarget(result);
    setPurpose('');
    setDialogError('');
  };

  const markRequested = (datasetId, myRequest) => {
    setSearchResults((prev) => prev.map((r) => (
      r.dataset_id === datasetId ? { ...r, my_request: myRequest } : r
    )));
  };

  const submitRequest = async () => {
    if (!requestTarget) return;
    setSubmitting(true);
    setDialogError('');
    try {
      const res = await axios.post(
        `${URL}/api/data-requests`,
        { dataset_id: requestTarget.dataset_id, purpose },
        { headers: authHeader() },
      );
      markRequested(requestTarget.dataset_id, {
        status: res.data?.status || 'pending',
        request_id: res.data?.request_id,
      });
      setRequestTarget(null);
      setSnackbar({ open: true, message: 'Request sent. The owner decides whether to approve it.', severity: 'success' });
    } catch (error) {
      const msg = error?.response?.data?.error || error.message || 'Could not send the request.';
      if (error?.response?.status === 409) {
        // An open request already exists — reflect that on the row instead of offering it again.
        markRequested(requestTarget.dataset_id, {
          status: 'open',
          request_id: error?.response?.data?.request_id,
        });
      }
      setDialogError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    // Clear search results and selected datasets whenever resetTrigger changes
    setSearchResults([]);
    setSelectedDatasets({});
    setPhenotype('');
    setMinSamples('');
    setName('');
    setSearched(false);
    setSearchError('');
  }, [resetTrigger]);

  // Pass the selected datasets to the parent whenever selectedDatasets or searchResults
  // change. This must also run when searchResults is empty: otherwise a second search
  // that matches nothing (or a reset) leaves the parent holding the previous selection,
  // and the collaboration is created with invitees the user can no longer see.
  // `onUserSelect` is optional — this page is also routed standalone at /search.
  useEffect(() => {
    if (typeof onUserSelect !== 'function') return;
    const selectedDatasetsList = searchResults
      .filter(dataset => selectedDatasets[dataset.dataset_id])
      .map(dataset => ({
        _id: dataset._id,
        dataset_id: dataset.dataset_id,
        phenotype: dataset.phenotype,
      }));

    onUserSelect(selectedDatasetsList);
  }, [selectedDatasets, searchResults, onUserSelect]);

  return (
    <Container component="div" maxWidth="lg" sx={{ borderRadius: 2 }}>
      <Grid container spacing={3} alignItems="center" justifyContent="center">
        <Grid item xs={12} sm={3}>
          <TextField
            fullWidth
            label="Name"
            variant="outlined"
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              sx: { borderRadius: 2, borderColor: 'divider' }
            }}
          />
        </Grid>
        <Grid item xs={12} sm={3}>
          <TextField
            fullWidth
            label="Phenotype(s)"
            variant="outlined"
            value={phenotype}
            onChange={(e) => setPhenotype(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              sx: { borderRadius: 2, borderColor: 'divider' }
            }}
          />
        </Grid>
        <Grid item xs={12} sm={3}>
          <TextField
            fullWidth
            label="Minimum # of Samples"
            variant="outlined"
            value={minSamples}
            onChange={(e) => setMinSamples(e.target.value)}
            sx={{ mb: 2 }}
            type="number"
            InputProps={{
              sx: { borderRadius: 2, borderColor: 'divider' }
            }}
          />
        </Grid>
        <Grid item xs={12} sm={3} md={3}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={searching ? <CircularProgress size={18} /> : <SearchIcon />}
            onClick={handleSearch}
            disabled={searching}
            fullWidth
            sx={{ padding: 1.5, fontSize: '1rem', mb: 2, borderRadius: 2 }}
          >
            {searching ? 'Searching…' : 'Search'}
          </Button>
        </Grid>

        {searchError && (
          <Grid item xs={12}>
            <Alert severity="error" sx={{ borderRadius: 2 }}>{searchError}</Alert>
          </Grid>
        )}

        <Grid item xs={12}>
          <Grid container spacing={3}>
            {searchResults.length > 0 ? (
              searchResults.map((result) => {
                const myRequest = result.my_request;
                const status = myRequest ? (REQUEST_STATUS[myRequest.status] || { label: myRequest.status, color: 'default' }) : null;
                return (
                  <Grid item xs={12} sm={6} md={4} key={result.dataset_id}>
                    <Card variant="outlined" sx={{ borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <CardContent sx={{ flex: 1 }}>
                        <Typography variant="h6" component="div">
                          {result.phenotype}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Number of Samples: {result.number_of_samples}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          By: {result.name}
                        </Typography>
                        {result.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            {result.description}
                          </Typography>
                        )}
                        {result.shareable && (
                          <Chip
                            size="small"
                            variant="outlined"
                            color="success"
                            icon={<ShieldOutlinedIcon />}
                            label={`Available to share · ε = ${result.share_epsilon}`}
                            sx={{ mt: 1.5 }}
                          />
                        )}
                      </CardContent>
                      <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          spacing={1}
                          flexWrap="wrap"
                          useFlexGap
                          sx={{ width: '100%' }}
                        >
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={!!selectedDatasets[result.dataset_id]}
                                onChange={() => handleDatasetSelect(result.dataset_id)}
                              />
                            }
                            label="Select for Collaboration"
                          />
                          {status ? (
                            <Chip
                              size="small"
                              color={status.color}
                              variant="outlined"
                              clickable
                              component={RouterLink}
                              to="/data-requests"
                              label={status.label}
                            />
                          ) : result.shareable ? (
                            <Button size="small" variant="outlined" sx={{ borderRadius: 2 }} onClick={() => openRequest(result)}>
                              Request data
                            </Button>
                          ) : null}
                        </Stack>
                      </CardActions>
                    </Card>
                  </Grid>
                );
              })
            ) : (
              <Typography variant="body1" color="text.secondary" sx={{ padding: 4 }}>
                {searching
                  ? 'Searching…'
                  : searched && !searchError
                    ? 'No datasets matched your search. Try a broader phenotype or a lower sample threshold.'
                    : 'Discover collaborators to partner with on your new experiment.'}
              </Typography>
            )}
          </Grid>
        </Grid>
      </Grid>

      <Dialog open={!!requestTarget} onClose={() => (submitting ? null : setRequestTarget(null))} fullWidth maxWidth="sm">
        <DialogTitle>Request data — {requestTarget?.phenotype}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {requestTarget?.name} advertises this dataset at ε = {requestTarget?.share_epsilon}. If they
            approve, their own Site Agent builds a differentially-private copy on their machine
            ({requestTarget?.share_mechanism}) and only that copy is released to you — never the raw data.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            sx={{ mt: 2 }}
            label="Purpose / justification"
            placeholder="What you plan to do with the data, and why this cohort."
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            The owner sees this note when deciding.
          </Typography>
          {dialogError && <Alert severity="error" sx={{ mt: 2 }}>{dialogError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRequestTarget(null)} disabled={submitting}>Cancel</Button>
          <Button
            variant="contained"
            sx={{ borderRadius: 2 }}
            onClick={submitRequest}
            disabled={submitting || !purpose.trim()}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {submitting ? 'Sending…' : 'Send request'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4500}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

export default SearchPage;
