import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Divider,
  Grid, Snackbar, Stack, Tooltip, Typography,
} from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import HubIcon from '@mui/icons-material/Hub';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import EventIcon from '@mui/icons-material/Event';
import GroupsIcon from '@mui/icons-material/Groups';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import axios from 'axios';
import URL from '../../config';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const pct = (v) => (typeof v === 'number' && !Number.isNaN(v) ? `${(v * 100).toFixed(1)}%` : '—');
const num = (v, d = 4) => (typeof v === 'number' && !Number.isNaN(v) ? v.toFixed(d) : '—');

const prettyDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const MetricTile = ({ label, value, accent }) => (
  <Box sx={{
    flex: 1, minWidth: 92, textAlign: 'center', py: 1.25, px: 1,
    borderRadius: 2, bgcolor: '#f6f9fc', border: '1px solid #e3ebf3',
  }}>
    <Typography variant="h6" sx={{ fontWeight: 700, color: accent || 'primary.main', lineHeight: 1.1 }}>
      {value}
    </Typography>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
  </Box>
);

const MetaRow = ({ icon, children }) => (
  <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
    {icon}
    <Typography variant="body2" color="text.secondary">{children}</Typography>
  </Stack>
);

const ModelCard = ({ model, onDownload, downloading }) => {
  const metrics = model.metrics || {};
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 3,
        overflow: 'hidden', transition: 'box-shadow .2s, transform .2s',
        '&:hover': { boxShadow: 6, transform: 'translateY(-2px)' },
      }}
    >
      <Box sx={{ height: 6, background: 'linear-gradient(90deg,#1976d2,#42a5f5)' }} />
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
            {model.name || model.collaboration_name || 'Federated model'}
          </Typography>
          <Tooltip title="Publicly shared model">
            <PublicIcon fontSize="small" sx={{ color: 'success.main', mt: 0.4 }} />
          </Tooltip>
        </Stack>

        <Stack direction="row" spacing={0.75} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" icon={<HubIcon />} label="Federated Learning" color="primary" variant="outlined" />
          {model.framework && <Chip size="small" label={model.framework} variant="outlined" />}
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
          {model.task || 'Federated model'} · {model.architecture || '1D-CNN'}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <MetricTile label="Accuracy" value={pct(metrics.accuracy)} />
          <MetricTile label="F1 (macro)" value={pct(metrics.f1_macro)} accent="#6a1b9a" />
          {metrics.loss != null
            ? <MetricTile label="Val loss" value={num(metrics.loss)} accent="#455a64" />
            : <MetricTile label="Train loss" value={num(metrics.train_loss)} accent="#455a64" />}
        </Stack>

        {Array.isArray(model.class_names) && model.class_names.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Classes</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {model.class_names.map((c) => (
                <Chip key={c} size="small" label={c} sx={{ bgcolor: '#eef3f8' }} />
              ))}
            </Stack>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Stack spacing={0.75}>
          <MetaRow icon={<PersonOutlineIcon fontSize="small" />}>Published by {model.created_by_name || 'Unknown'}</MetaRow>
          <MetaRow icon={<EventIcon fontSize="small" />}>{prettyDate(model.published_at)}</MetaRow>
          <MetaRow icon={<GroupsIcon fontSize="small" />}>
            {model.num_participants ?? '—'} participating sites · {model.num_rounds ?? '—'} FedAvg rounds
          </MetaRow>
          <MetaRow icon={<ShieldOutlinedIcon fontSize="small" />}>
            Privacy budget ε = {model.epsilon ?? '—'}
          </MetaRow>
        </Stack>

        <Box sx={{ flex: 1 }} />

        <Tooltip title={model.has_weights ? 'Download model weights + metadata (JSON)' : 'Weights not available for this model'}>
          <span>
            <Button
              fullWidth variant="contained" sx={{ mt: 2, borderRadius: 2 }}
              startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadRoundedIcon />}
              disabled={!model.has_weights || downloading}
              onClick={() => onDownload(model)}
            >
              {downloading ? 'Preparing…' : 'Download model'}
            </Button>
          </span>
        </Tooltip>
      </CardContent>
    </Card>
  );
};

const ModelRepository = () => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await axios.get(`${URL}/api/models`, { headers: authHeader() });
      setModels(resp?.data?.models || []);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const handleDownload = async (model) => {
    setDownloadingId(model.model_id);
    try {
      const resp = await axios.get(`${URL}/api/models/${model.model_id}/download`, { headers: authHeader() });
      const blob = new Blob([JSON.stringify(resp.data, null, 2)], { type: 'application/json' });
      const safe = (model.collaboration_name || model.name || 'model')
        .replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'model';
      const link = document.createElement('a');
      const objectUrl = window.URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `${safe}.model.json`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(objectUrl);
      document.body.removeChild(link);
      setSnackbar({ open: true, message: 'Model downloaded.', severity: 'success' });
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Download failed';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      {/* Hero */}
      <Box sx={{
        p: { xs: 2.5, md: 3.5 }, mb: 3, borderRadius: 3, color: 'white',
        background: 'linear-gradient(120deg,#0f3a63 0%,#1976d2 60%,#42a5f5 100%)',
      }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <PublicIcon sx={{ fontSize: 34 }} />
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Model Repository</Typography>
        </Stack>
        <Typography variant="body1" sx={{ mt: 1, maxWidth: 780, opacity: 0.95 }}>
          Global models trained by federated-learning collaborations whose initiators chose to share
          them publicly. Every model here was aggregated across multiple sites without any raw genotype
          data leaving its owner — only weights, metrics, and metadata are published. Browse and download
          any model to reuse or evaluate.
        </Typography>
      </Box>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" color="text.secondary">
          {loading ? 'Loading…' : `${models.length} published model${models.length === 1 ? '' : 's'}`}
        </Typography>
        <Button size="small" startIcon={<RefreshIcon />} onClick={fetchModels} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      {error && <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : models.length === 0 && !error ? (
        <Card variant="outlined" sx={{ borderRadius: 3, borderStyle: 'dashed' }}>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <PublicIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
            <Typography variant="h6" sx={{ mt: 1.5, fontWeight: 600 }}>No models published yet</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 520, mx: 'auto' }}>
              When a Federated Learning collaboration finishes training and its initiator opted to
              publish the global model, it will appear here for everyone to download.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {models.map((model) => (
            <Grid item xs={12} sm={6} md={4} key={model.model_id}>
              <ModelCard
                model={model}
                onDownload={handleDownload}
                downloading={downloadingId === model.model_id}
              />
            </Grid>
          ))}
        </Grid>
      )}

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
};

export default ModelRepository;
