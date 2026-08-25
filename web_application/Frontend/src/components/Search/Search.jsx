import React, { useState, useEffect } from 'react';
import {
  Alert, Box, Button, Card, CardActions, CardContent, Checkbox, Chip, CircularProgress,
  Container, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  Grid, Slider, Snackbar, Stack, TextField, Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import axios from 'axios';
import URL from '../../config';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const EPS_MIN = 0.1;
const EPS_MAX = 20;
const EPS_FALLBACK = 3;

const epsilonMeaning = (eps) => {
  if (eps <= 1) return { label: 'Very strong privacy', color: 'success', hint: 'heavy noise — coarse trends only' };
  if (eps <= 3) return { label: 'Strong privacy', color: 'success', hint: 'noticeable noise, broad signals survive' };
  if (eps <= 8) return { label: 'Moderate privacy', color: 'warning', hint: 'a balanced amount of noise' };
  return { label: 'Weak privacy', color: 'error', hint: 'little noise — close to the real data' };
};

const trim = (n) => String(Number(n.toFixed(2)));
const clampEps = (n) => Math.min(EPS_MAX, Math.max(EPS_MIN, n));

// Label the owner's advertised ε on the track. A bound label sitting under the owner's
// mark would overlap it, so drop the one that collides.
const epsMarks = (advertised) => {
  const bounds = [{ value: EPS_MIN, label: String(EPS_MIN) }, { value: EPS_MAX, label: String(EPS_MAX) }];
  // A mark outside [min, max] is rendered off the end of the track, so an oddly
  // advertised ε is left unlabelled rather than drawn past the bounds.
  if (!Number.isFinite(advertised) || advertised < EPS_MIN || advertised > EPS_MAX) return bounds;
  return [
    ...bounds.filter((m) => Math.abs(m.value - advertised) > 1.2),
    { value: advertised, label: `owner suggests ${trim(advertised)}` },
  ].sort((a, b) => a.value - b.value);
};

const REQUEST_STATUS = {
  pending: { label: 'Requested — pending', color: 'warning' },
  approved: { label: 'Approved', color: 'info' },
  transforming: { label: 'Approved — preparing copy', color: 'info' },
  ready: { label: 'Ready to download', color: 'success' },
  downloading: { label: 'Downloading', color: 'info' },
  downloaded: { label: 'Collected — copy erased', color: 'success' },
  denied: { label: 'Denied', color: 'default' },
  failed: { label: 'Transform failed', color: 'error' },
  open: { label: 'Request already open', color: 'warning' },
};

// A collected request is closed business: the handover happened once and the server
// erased its copy, so the backend allows a fresh request for the same dataset. The
// card has to offer that, otherwise a lost file is unrecoverable from the UI.
// `failed` belongs here for the same reason — the owner's transform blew up, there is
// nothing to download and no retry anywhere else, so asking again is the only way out.
// `denied` deliberately stays off the list: the owner said no, and the UI should not
// hand out a one-click way to keep asking.
const REREQUESTABLE = ['downloaded', 'failed'];

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
  const [epsText, setEpsText] = useState(String(EPS_FALLBACK));
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const advertisedEps = Number(requestTarget?.share_epsilon);
  const epsNum = Number(epsText);
  const epsValid = epsText.trim() !== '' && Number.isFinite(epsNum) && epsNum >= EPS_MIN && epsNum <= EPS_MAX;
  // The slider needs an in-range number even while the typed field is mid-edit or out of
  // bounds. A number that is merely out of range is clamped to the nearest bound, so typing
  // 50 pins the handle at 20 instead of throwing it back to the owner's suggestion; only a
  // blank or unparseable field falls back to the advertised ε.
  const sliderEps = clampEps(
    Number.isFinite(epsNum) && epsText.trim() !== ''
      ? epsNum
      : (Number.isFinite(advertisedEps) ? advertisedEps : EPS_FALLBACK),
  );
  const meaning = epsilonMeaning(sliderEps);
  const weaker = epsValid && Number.isFinite(advertisedEps) && epsNum > advertisedEps;

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
    // Seed from the owner's advertised ε, but clamp it: a legacy dataset can carry a
    // share_epsilon outside 0.1–20, and seeding that verbatim would open the dialog
    // already in an error state with Send disabled and nothing the user did wrong.
    const seed = Number(result?.share_epsilon);
    setEpsText(String(Number.isFinite(seed) && seed > 0 ? clampEps(seed) : EPS_FALLBACK));
    setDialogError('');
  };

  const markRequested = (datasetId, myRequest) => {
    setSearchResults((prev) => prev.map((r) => (
      r.dataset_id === datasetId ? { ...r, my_request: myRequest } : r
    )));
  };

  const submitRequest = async () => {
    if (!requestTarget) return;
    if (!epsValid) {
      setDialogError(`ε must be between ${EPS_MIN} and ${EPS_MAX}.`);
      return;
    }
    setSubmitting(true);
    setDialogError('');
    try {
      const res = await axios.post(
        `${URL}/api/data-requests`,
        {
          dataset_id: requestTarget.dataset_id,
          purpose,
          requested_epsilon: Number(epsNum.toFixed(2)),
        },
        { headers: authHeader() },
      );
      markRequested(requestTarget.dataset_id, {
        status: res.data?.status || 'pending',
        request_id: res.data?.request_id,
      });
      setRequestTarget(null);
      setSnackbar({
        open: true,
        message: `Request sent asking for ε = ${trim(epsNum)}. The owner decides whether to approve it.`,
        severity: 'success',
      });
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
                const canRequest = result.shareable && (!myRequest || REREQUESTABLE.includes(myRequest.status));
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
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            {status && (
                              <Chip
                                size="small"
                                color={status.color}
                                variant="outlined"
                                clickable
                                component={RouterLink}
                                to="/data-requests"
                                label={status.label}
                              />
                            )}
                            {canRequest && (
                              <Button size="small" variant="outlined" sx={{ borderRadius: 2 }} onClick={() => openRequest(result)}>
                                {myRequest ? 'Request again' : 'Request data'}
                              </Button>
                            )}
                          </Stack>
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

          <Divider sx={{ my: 2.5 }} />

          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Privacy budget you are asking for (ε)
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Lower ε means more noise — stronger privacy for the owner&apos;s participants. Higher ε
            keeps the copy closer to their real data.
          </Typography>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={3}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            sx={{ mt: 2 }}
          >
            <Box sx={{ flex: 1, px: 1 }}>
              <Slider
                value={sliderEps}
                min={EPS_MIN}
                max={EPS_MAX}
                step={0.1}
                valueLabelDisplay="auto"
                marks={epsMarks(advertisedEps)}
                onChange={(e, v) => setEpsText(String(v))}
              />
            </Box>
            <TextField
              label="ε"
              size="small"
              type="number"
              sx={{ width: 150 }}
              value={epsText}
              onChange={(e) => setEpsText(e.target.value)}
              inputProps={{ min: EPS_MIN, max: EPS_MAX, step: 0.1 }}
              error={!epsValid}
              helperText={epsValid ? `${EPS_MIN} – ${EPS_MAX}` : `Must be between ${EPS_MIN} and ${EPS_MAX}`}
            />
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            <Chip size="small" color={meaning.color} variant="outlined" label={meaning.label} />
            <Typography variant="caption" color="text.secondary">{meaning.hint}</Typography>
          </Stack>

          {weaker ? (
            <Alert severity="warning" sx={{ mt: 2 }}>
              You are asking {requestTarget?.name || 'the owner'} to release this cohort with less
              noise than they advertised — ε {trim(epsNum)} against their ε {trim(advertisedEps)}.
              They see the number you ask for and can refuse the request on that basis.
            </Alert>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              {requestTarget?.name || 'The owner'} sees the ε you ask for and can refuse it. If they
              approve, the copy is built at this ε.
            </Typography>
          )}

          {dialogError && <Alert severity="error" sx={{ mt: 2 }}>{dialogError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRequestTarget(null)} disabled={submitting}>Cancel</Button>
          <Button
            variant="contained"
            sx={{ borderRadius: 2 }}
            onClick={submitRequest}
            disabled={submitting || !purpose.trim() || !epsValid}
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
