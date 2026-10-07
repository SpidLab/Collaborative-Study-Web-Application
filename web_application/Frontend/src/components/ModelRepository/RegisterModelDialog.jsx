import React, { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, Grid, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import axios from 'axios';
import URL from '../../config';
import { relabel } from '../Utils/demoTerms';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const EMPTY = {
  name: '', description: '', dataset: '', task: '', framework: '', architecture: '',
  num_classes: '', class_names: '', num_rounds: '', num_participants: '',
  accuracy: '', f1_macro: '', loss: '',
  local_file: '', local_format: '',
  visibility: 'private', allow_inference_requests: false,
};

const isBlank = (raw) => String(raw ?? '').trim() === '';
// Number('') and Number('   ') are both 0, so blankness has to be checked first.
const isNumeric = (raw) => !isBlank(raw) && !Number.isNaN(Number(raw));
const isFraction = (raw) => isNumeric(raw) && Number(raw) >= 0 && Number(raw) <= 1;

const RegisterModelDialog = ({ open, onClose, onRegistered }) => {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => {
      // A private entry cannot advertise a service, so keep the two in step here
      // rather than letting the server silently drop the flag.
      if (key === 'visibility' && value !== 'public') {
        return { ...f, visibility: value, allow_inference_requests: false };
      }
      return { ...f, [key]: value };
    });
  };

  const close = () => {
    if (saving) return;
    setForm(EMPTY);
    setError('');
    onClose();
  };

  const badAccuracy = !isBlank(form.accuracy) && !isFraction(form.accuracy);
  const badF1 = !isBlank(form.f1_macro) && !isFraction(form.f1_macro);
  const badLoss = !isBlank(form.loss) && !isNumeric(form.loss);
  const canSave = form.name.trim() && !badAccuracy && !badF1 && !badLoss;

  const submit = async () => {
    setSaving(true);
    setError('');
    const metrics = {};
    if (!isBlank(form.accuracy)) metrics.accuracy = Number(form.accuracy);
    if (!isBlank(form.f1_macro)) metrics.f1_macro = Number(form.f1_macro);
    if (!isBlank(form.loss)) metrics.loss = Number(form.loss);
    try {
      const resp = await axios.post(`${URL}/api/models`, {
        name: form.name.trim(),
        description: form.description.trim(),
        dataset: form.dataset.trim(),
        task: form.task.trim(),
        framework: form.framework.trim(),
        architecture: form.architecture.trim(),
        num_classes: form.num_classes,
        class_names: form.class_names,
        num_rounds: form.num_rounds,
        num_participants: form.num_participants,
        metrics,
        local_file: form.local_file.trim(),
        local_format: form.local_format,
        visibility: form.visibility,
        allow_inference_requests: form.allow_inference_requests,
      }, { headers: authHeader() });
      setForm(EMPTY);
      onRegistered(resp.data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not register the model');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>Register a model</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" icon={<LockOutlinedIcon fontSize="inherit" />} sx={{ mb: 2.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            This form uploads metadata only. There is no file to attach.
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Your model file stays on your own machine. What gets listed here is the description
            below: what the model does, what it was trained on, and how it scored. Further down you
            can also record the file&apos;s <b>name</b> — the name only, never the file — so your own
            Site Agent can find it. With that one fact a model you trained elsewhere does everything
            a model trained here does: it can answer classification requests and it can be
            privacy-audited, both entirely on your machine, returning predictions and aggregate
            numbers and nothing else.
          </Typography>
        </Alert>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{relabel(error)}</Alert>}

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              label="Model name" required fullWidth autoFocus
              value={form.name} onChange={set('name')}
              placeholder="Crop disease risk classifier"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Dataset it was trained on" fullWidth
              value={form.dataset} onChange={set('dataset')}
              placeholder="Regional soil and yield records"
              helperText="Shown next to the metrics, so the numbers are always attributed."
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Description" fullWidth multiline minRows={2}
              value={form.description} onChange={set('description')}
              placeholder="What the model predicts, how it was built, known limitations."
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField label="Task" fullWidth value={form.task} onChange={set('task')}
              placeholder="Binary classification" />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField label="Framework" fullWidth value={form.framework} onChange={set('framework')}
              placeholder="PyTorch" />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField label="Architecture" fullWidth value={form.architecture} onChange={set('architecture')}
              placeholder="1D-CNN" />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField label="Number of classes" type="number" fullWidth
              value={form.num_classes} onChange={set('num_classes')} />
          </Grid>
          <Grid item xs={12} md={8}>
            <TextField label="Class names" fullWidth
              value={form.class_names} onChange={set('class_names')}
              placeholder="control, case"
              helperText="Comma separated." />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField label="Training rounds" type="number" fullWidth
              value={form.num_rounds} onChange={set('num_rounds')} />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField label="Contributing sites" type="number" fullWidth
              value={form.num_participants} onChange={set('num_participants')} />
          </Grid>

          <Grid item xs={12}>
            <Divider />
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Reported performance</Typography>
            <Typography variant="caption" color="text.secondary">
              Optional, and self-reported — these numbers are shown attributed to the dataset above.
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField label="Accuracy" fullWidth value={form.accuracy} onChange={set('accuracy')}
              error={badAccuracy} helperText={badAccuracy ? 'Enter a value between 0 and 1' : '0–1, e.g. 0.87'} />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField label="F1 (macro)" fullWidth value={form.f1_macro} onChange={set('f1_macro')}
              error={badF1} helperText={badF1 ? 'Enter a value between 0 and 1' : '0–1, e.g. 0.81'} />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField label="Loss" fullWidth value={form.loss} onChange={set('loss')}
              error={badLoss}
              helperText={badLoss ? 'Enter a number, or leave it blank' : 'Validation loss, if you have one.'} />
          </Grid>

          <Grid item xs={12}>
            <Divider />
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
              <FolderOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              <Typography variant="subtitle2">Where the file sits on your machine</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Optional, but it is what makes the entry do something. <b>The file is not uploaded and
              never will be — only its name is recorded here</b>, so your own Site Agent knows which
              file to open when a classification request or a privacy audit arrives. Put the file in
              your agent&apos;s model folder (<code>/models</code> in Docker) and give the name below.
              Supported: scikit-learn <code>.joblib</code> / <code>.pkl</code>, TorchScript{' '}
              <code>.pt</code>, and this sandbox&apos;s own format. If the file is already named after
              the model id (<code>&lt;model_id&gt;.joblib</code>) the agent finds it without this
              field, and an optional <code>&lt;model_id&gt;.json</code> beside it can declare the
              column order, class count and class names.
            </Typography>
          </Grid>
          <Grid item xs={12} md={7}>
            <TextField
              label="Model file name" fullWidth
              value={form.local_file} onChange={set('local_file')}
              placeholder="my_model.joblib"
              helperText="The file name only — not a path, and not an upload. Leave blank to add it later."
            />
          </Grid>
          <Grid item xs={12} md={5}>
            <TextField select label="File format" fullWidth
              value={form.local_format} onChange={set('local_format')}
              helperText="Detected from the extension unless you say otherwise.">
              <MenuItem value="">Detect from the extension</MenuItem>
              <MenuItem value="sklearn">scikit-learn (.joblib, .pkl)</MenuItem>
              <MenuItem value="torchscript">TorchScript (.pt)</MenuItem>
              <MenuItem value="native">This sandbox&apos;s own format</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12}>
            <Divider />
          </Grid>
          <Grid item xs={12} md={5}>
            <TextField select label="Visibility" fullWidth value={form.visibility} onChange={set('visibility')}>
              <MenuItem value="private">Private — only you see this entry</MenuItem>
              <MenuItem value="public">Public — every researcher sees the entry</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={7}>
            <Box sx={{ pt: { md: 1 } }}>
              <FormControlLabel
                control={(
                  <Switch
                    checked={form.allow_inference_requests}
                    disabled={form.visibility !== 'public'}
                    onChange={set('allow_inference_requests')}
                  />
                )}
                label="Accept classification requests"
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {form.visibility === 'public'
                  ? 'Others may send you samples to classify. You approve each request individually.'
                  : 'Only available on public entries. You can turn it on later.'}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={close} disabled={saving}>Cancel</Button>
        <Button
          variant="contained" onClick={submit} disabled={!canSave || saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {saving ? 'Registering…' : 'Register model'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RegisterModelDialog;
