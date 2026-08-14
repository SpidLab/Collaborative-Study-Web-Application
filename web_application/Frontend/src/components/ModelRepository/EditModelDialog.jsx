import React, { useEffect, useState } from 'react';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, TextField, Typography,
} from '@mui/material';
import axios from 'axios';
import URL from '../../config';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const asText = (v) => (v == null ? '' : String(v));

const EditModelDialog = ({ open, model, onClose, onSaved }) => {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isExternal = (model?.source || 'federated') === 'external';

  useEffect(() => {
    if (!open || !model) return;
    setForm({
      name: asText(model.name),
      description: asText(model.description),
      dataset: asText(model.dataset),
      task: asText(model.task),
      framework: asText(model.framework),
      architecture: asText(model.architecture),
      num_classes: asText(model.num_classes),
      num_rounds: asText(model.num_rounds),
      num_participants: asText(model.num_participants),
    });
    setError('');
  }, [open, model]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const close = () => {
    if (saving) return;
    setError('');
    onClose();
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    const trimmed = (key) => (form[key] || '').trim();
    const body = {
      name: trimmed('name'),
      description: trimmed('description'),
      dataset: trimmed('dataset'),
      task: trimmed('task'),
      framework: trimmed('framework'),
      architecture: trimmed('architecture'),
    };
    if (isExternal) {
      body.num_classes = form.num_classes;
      body.num_rounds = form.num_rounds;
      body.num_participants = form.num_participants;
    }
    try {
      const resp = await axios.patch(`${URL}/api/models/${model.model_id}`, body, { headers: authHeader() });
      onSaved(resp.data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not save your changes');
    } finally {
      setSaving(false);
    }
  };

  if (!model) return null;

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>Edit model details</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!isExternal && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This model was trained here. Its measured results — accuracy, F1, loss, rounds and site
            count — are the sandbox&apos;s own record and stay as they are.
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField label="Model name" required fullWidth value={form.name || ''} onChange={set('name')} />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Description" fullWidth multiline minRows={2}
              value={form.description || ''} onChange={set('description')} />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Dataset it was trained on" fullWidth
              value={form.dataset || ''} onChange={set('dataset')}
              helperText="Shown next to the metrics so the numbers are always attributed." />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField label="Task" fullWidth value={form.task || ''} onChange={set('task')} />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField label="Framework" fullWidth value={form.framework || ''} onChange={set('framework')} />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField label="Architecture" fullWidth value={form.architecture || ''} onChange={set('architecture')} />
          </Grid>

          {isExternal && (
            <>
              <Grid item xs={12}>
                <Typography variant="subtitle2">Reported setup</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField label="Number of classes" type="number" fullWidth
                  value={form.num_classes || ''} onChange={set('num_classes')} />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField label="Training rounds" type="number" fullWidth
                  value={form.num_rounds || ''} onChange={set('num_rounds')} />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField label="Contributing sites" type="number" fullWidth
                  value={form.num_participants || ''} onChange={set('num_participants')} />
              </Grid>
            </>
          )}
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={close} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={submit}
          disabled={saving || !(form.name || '').trim()}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditModelDialog;
