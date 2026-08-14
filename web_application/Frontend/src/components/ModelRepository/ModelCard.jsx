import React, { useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, Divider, FormControlLabel, Stack, Switch,
  Tooltip, Typography,
} from '@mui/material';
import HubIcon from '@mui/icons-material/Hub';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PublicIcon from '@mui/icons-material/Public';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import StorageIcon from '@mui/icons-material/Storage';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import EventIcon from '@mui/icons-material/Event';
import GroupsIcon from '@mui/icons-material/Groups';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';

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
    flex: 1, minWidth: 84, textAlign: 'center', py: 1.25, px: 1,
    borderRadius: 2, bgcolor: '#f6f9fc', border: '1px solid #e3ebf3',
  }}>
    <Typography variant="h6" sx={{ fontWeight: 700, color: accent || 'primary.main', lineHeight: 1.1 }}>
      {value}
    </Typography>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
  </Box>
);

const MetaRow = ({ icon, children }) => (
  <Stack direction="row" spacing={1} alignItems="center">
    {icon}
    <Typography variant="body2" color="text.secondary">{children}</Typography>
  </Stack>
);

const ModelCard = ({ model, onPatch, onEdit, onDelete, onRequestClassification }) => {
  const [busy, setBusy] = useState(false);

  const metrics = model.metrics || {};
  const loss = metrics.loss != null ? metrics.loss : metrics.train_loss;
  const hasMetrics = [metrics.accuracy, metrics.f1_macro, loss].some((v) => typeof v === 'number');
  const isFederated = (model.source || 'federated') === 'federated';
  const isPublic = model.visibility === 'public';
  const classNames = Array.isArray(model.class_names) ? model.class_names : [];
  const shownClasses = classNames.slice(0, 8);

  const patch = async (body) => {
    setBusy(true);
    try {
      await onPatch(model, body);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 2,
        overflow: 'hidden', transition: 'box-shadow .2s, transform .2s',
        '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
      }}
    >
      <Box sx={{
        height: 5,
        background: isFederated
          ? 'linear-gradient(90deg,#0f3a63,#42a5f5)'
          : 'linear-gradient(90deg,#4a148c,#9575cd)',
      }} />

      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {model.name || model.collaboration_name || 'Untitled model'}
        </Typography>

        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
          <Tooltip title={isFederated
            ? 'Trained inside this sandbox by a federated-learning collaboration'
            : 'Brought by its owner and listed here as metadata'}>
            <Chip
              size="small"
              icon={isFederated ? <HubIcon /> : <Inventory2OutlinedIcon />}
              label={isFederated ? 'Federated' : 'Registered'}
              color={isFederated ? 'primary' : 'secondary'}
              variant="outlined"
            />
          </Tooltip>
          <Tooltip title={isPublic
            ? 'Every logged-in researcher can see this entry'
            : 'Only you can see this entry'}>
            <Chip
              size="small"
              icon={isPublic ? <PublicIcon /> : <LockOutlinedIcon />}
              label={isPublic ? 'Public' : 'Private'}
              color={isPublic ? 'primary' : 'default'}
              variant={isPublic ? 'filled' : 'outlined'}
            />
          </Tooltip>
          {model.allow_inference_requests && (
            <Tooltip title="The owner's agent will classify samples you send, on their own machine">
              <Chip size="small" icon={<ScienceOutlinedIcon />} label="Black-box service" color="success" variant="outlined" />
            </Tooltip>
          )}
          {model.framework && <Chip size="small" label={model.framework} variant="outlined" />}
        </Stack>

        {model.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {model.description}
          </Typography>
        )}

        <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 500 }}>
          {model.task || 'Classification'}
          {model.architecture ? ` · ${model.architecture}` : ''}
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <StorageIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            Trained on <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {model.dataset || 'an unnamed dataset'}
            </Box>
          </Typography>
        </Stack>

        <Box sx={{ mt: 2 }}>
          {hasMetrics ? (
            <>
              <Stack direction="row" spacing={1}>
                <MetricTile label="Accuracy" value={pct(metrics.accuracy)} />
                <MetricTile label="F1 (macro)" value={pct(metrics.f1_macro)} accent="#6a1b9a" />
                <MetricTile label="Loss" value={num(loss)} accent="#455a64" />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                Measured on {model.dataset || 'a dataset the owner has not named'} — not a universal score.
              </Typography>
            </>
          ) : (
            <Typography variant="caption" color="text.secondary">
              No performance metrics reported for this model.
            </Typography>
          )}
        </Box>

        {shownClasses.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Classes</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {shownClasses.map((c) => (
                <Chip key={c} size="small" label={c} sx={{ bgcolor: '#eef3f8' }} />
              ))}
              {classNames.length > shownClasses.length && (
                <Chip size="small" variant="outlined" label={`+${classNames.length - shownClasses.length}`} />
              )}
            </Stack>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Stack spacing={0.75}>
          <MetaRow icon={<PersonOutlineIcon fontSize="small" sx={{ color: 'text.secondary' }} />}>
            {model.is_owner ? 'You' : model.owner_name || 'Unknown owner'}
            {model.collaboration_name ? ` · ${model.collaboration_name}` : ''}
          </MetaRow>
          <MetaRow icon={<EventIcon fontSize="small" sx={{ color: 'text.secondary' }} />}>
            Listed {prettyDate(model.published_at)}
          </MetaRow>
          {(model.num_participants != null || model.num_rounds != null) && (
            <MetaRow icon={<GroupsIcon fontSize="small" sx={{ color: 'text.secondary' }} />}>
              {model.num_participants ?? '—'} sites · {model.num_rounds ?? '—'} rounds
              {model.num_classes != null ? ` · ${model.num_classes} classes` : ''}
            </MetaRow>
          )}
          <MetaRow icon={<LockOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />}>
            Catalog entry only — the weights stay on the owner&apos;s machine.
          </MetaRow>
        </Stack>

        <Box sx={{ flex: 1 }} />

        {model.is_owner ? (
          <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: '#fafbfd' }}>
            <Typography variant="overline" color="text.secondary">Owner controls</Typography>
            <Stack sx={{ mt: 0.5 }}>
              <FormControlLabel
                control={(
                  <Switch
                    size="small"
                    checked={isPublic}
                    disabled={busy}
                    onChange={(e) => patch({ visibility: e.target.checked ? 'public' : 'private' })}
                  />
                )}
                label={<Typography variant="body2">Listed publicly</Typography>}
              />
              <FormControlLabel
                control={(
                  <Switch
                    size="small"
                    checked={!!model.allow_inference_requests}
                    disabled={busy || !isPublic}
                    onChange={(e) => patch({ allow_inference_requests: e.target.checked })}
                  />
                )}
                label={(
                  <Typography variant="body2" color={isPublic ? 'text.primary' : 'text.disabled'}>
                    Accept classification requests
                  </Typography>
                )}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                {isPublic
                  ? 'Others can ask you to classify their samples; your agent runs the model locally and returns predictions only.'
                  : 'Make it public first — a private entry cannot advertise a service.'}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />}
                disabled={busy} onClick={() => onEdit(model)}>
                Edit
              </Button>
              {!isFederated && (
                <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlineIcon />}
                  disabled={busy} onClick={() => onDelete(model)}>
                  Delete
                </Button>
              )}
            </Stack>
            {isFederated && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                A federated entry is the record of a collaboration that happened, so it cannot be
                deleted. Switch it to private to unlist it.
              </Typography>
            )}
          </Box>
        ) : model.allow_inference_requests ? (
          <Button
            fullWidth variant="contained" sx={{ mt: 2, borderRadius: 2 }}
            startIcon={<SendOutlinedIcon />}
            onClick={() => onRequestClassification(model)}
          >
            Request classification
          </Button>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
            The owner is not offering a classification service for this model.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default ModelCard;
