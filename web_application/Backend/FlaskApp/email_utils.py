"""Transactional email for the Collaborative Study server.

Pilot setup: a plain Gmail account + App Password over SMTP (STARTTLS). Every
send is **best-effort** — a misconfigured or unreachable mail server must never
break the API request that triggered the email, so ``send_email`` logs and
swallows all errors and returns a bool instead of raising.

Provider-agnostic: moving to Amazon SES (or any SMTP provider) later only means
changing the ``SMTP_*`` environment variables — the call sites do not change.

Environment variables (read lazily, like OPENAI_API_KEY elsewhere):
    SMTP_HOST        default smtp.gmail.com
    SMTP_PORT        default 587 (STARTTLS)
    SMTP_USER        the Gmail account that sends (login)
    SMTP_PASS        a Gmail **App Password** (NOT the account password)
    EMAIL_FROM       From address (defaults to SMTP_USER)
    EMAIL_FROM_NAME  From display name (default "Collaborative Study")
    APP_BASE_URL     base URL for links in emails (falls back to FRONTEND_URL,
                     then http://localhost:5173)
"""
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

logger = logging.getLogger("email")


def _cfg():
    user = os.getenv("SMTP_USER", "")
    return {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": user,
        "password": os.getenv("SMTP_PASS", ""),
        "from_addr": os.getenv("EMAIL_FROM") or user,
        "from_name": os.getenv("EMAIL_FROM_NAME", "Collaborative Study"),
    }


def email_enabled():
    """True only if SMTP credentials are configured."""
    c = _cfg()
    return bool(c["user"] and c["password"])


def app_base_url():
    """Base URL used to build links inside emails (points at the FRONTEND)."""
    return (os.getenv("APP_BASE_URL") or os.getenv("FRONTEND_URL")
            or "http://localhost:5173").rstrip("/")


def send_email(to, subject, body_text, body_html=None):
    """Send a single email. Returns True on success, False otherwise. Never raises.

    ``to`` may be a string or a list of addresses.
    """
    recipients = [to] if isinstance(to, str) else [t for t in (to or []) if t]
    recipients = [r for r in recipients if r]
    if not recipients:
        return False

    c = _cfg()
    if not (c["user"] and c["password"]):
        logger.info("Email not configured (SMTP_USER/SMTP_PASS unset); "
                    "skipping '%s' to %s", subject, recipients)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f'{c["from_name"]} <{c["from_addr"]}>'
    if len(recipients) == 1:
        msg["To"] = recipients[0]
    else:
        # Multiple participants: hide their addresses from each other via Bcc so we
        # don't leak collaborators' emails. send_message delivers to Bcc and strips
        # the header from the transmitted message.
        msg["To"] = c["from_addr"]
        msg["Bcc"] = ", ".join(recipients)
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(c["host"], c["port"], timeout=20) as server:
            server.starttls(context=ctx)
            server.login(c["user"], c["password"])
            server.send_message(msg)
        logger.info("Sent email '%s' to %s", subject, recipients)
        return True
    except Exception as e:  # never let email break the request
        logger.warning("Failed to send email '%s' to %s: %s", subject, recipients, e)
        return False


# ---- event-specific helpers -------------------------------------------------
# Each takes already-resolved recipient email(s); the caller looks up emails
# from the users collection. All return a bool and never raise.

def notify_invitation(to_email, inviter_name, collab_name, collab_uuid):
    """Tell an invited collaborator they've been invited."""
    link = f"{app_base_url()}/collaboration/{collab_uuid}"
    inviter = inviter_name or "A colleague"
    subject = f"You've been invited to a study collaboration: {collab_name}"
    text = (
        f"{inviter} has invited you to collaborate on \"{collab_name}\" "
        f"in the Collaborative Study app.\n\n"
        f"Log in to review and accept the invitation:\n{link}\n\n"
        f"After you accept, make sure your Site Agent (helper) is running so your "
        f"quality-control results can be computed locally on your machine.\n"
    )
    html = (
        f"<p><b>{inviter}</b> has invited you to collaborate on "
        f"\"<b>{collab_name}</b>\" in the Collaborative Study app.</p>"
        f"<p><a href=\"{link}\">Log in to review and accept the invitation</a>.</p>"
        f"<p>After you accept, make sure your Site Agent (helper) is running so your "
        f"quality-control results can be computed locally on your machine.</p>"
    )
    return send_email(to_email, subject, text, html)


def notify_data_request(to_email, requester_name, phenotype):
    """Tell a dataset owner that someone has asked for a copy of their data."""
    link = f"{app_base_url()}/data-requests"
    who = requester_name or "A researcher"
    label = phenotype or "one of your datasets"
    subject = f"{who} has requested a copy of your dataset: {label}"
    text = (
        f"{who} has requested a privacy-protected copy of your dataset \"{label}\".\n\n"
        f"Review and approve or deny the request:\n{link}\n\n"
        f"If you approve, your own Site Agent produces the differentially-private copy "
        f"on your machine at the privacy budget you advertised. Your raw data never leaves it.\n"
    )
    html = (
        f"<p><b>{who}</b> has requested a privacy-protected copy of your dataset "
        f"\"<b>{label}</b>\".</p>"
        f"<p><a href=\"{link}\">Review and approve or deny the request</a>.</p>"
        f"<p>If you approve, your own Site Agent produces the differentially-private copy "
        f"on your machine at the privacy budget you advertised. Your raw data never leaves it.</p>"
    )
    return send_email(to_email, subject, text, html)


def notify_inference_request(to_email, requester_name, model_name):
    """Tell a model owner that someone has asked their model to classify samples."""
    link = f"{app_base_url()}/inference-requests"
    who = requester_name or "A researcher"
    label = model_name or "your model"
    subject = f"{who} has asked \"{label}\" to classify some samples"
    text = (
        f"{who} would like your model \"{label}\" to classify a set of samples.\n\n"
        f"Review and approve or deny the request:\n{link}\n\n"
        f"If you approve, your own Site Agent runs your local copy of the model and "
        f"returns only the predictions. Your model is never uploaded or shared.\n"
    )
    html = (
        f"<p><b>{who}</b> would like your model \"<b>{label}</b>\" to classify a set of samples.</p>"
        f"<p><a href=\"{link}\">Review and approve or deny the request</a>.</p>"
        f"<p>If you approve, your own Site Agent runs your local copy of the model and "
        f"returns only the predictions. Your model is never uploaded or shared.</p>"
    )
    return send_email(to_email, subject, text, html)


def notify_invitation_accepted(to_email, accepter_name, collab_name, collab_uuid):
    """Tell the initiator that a collaborator accepted."""
    link = f"{app_base_url()}/collaboration/{collab_uuid}"
    who = accepter_name or "A collaborator"
    subject = f"{who} accepted your invitation: {collab_name}"
    text = (
        f"{who} has accepted your invitation to collaborate on \"{collab_name}\".\n\n"
        f"View the collaboration:\n{link}\n"
    )
    html = (
        f"<p><b>{who}</b> has accepted your invitation to collaborate on "
        f"\"<b>{collab_name}</b>\".</p>"
        f"<p><a href=\"{link}\">View the collaboration</a>.</p>"
    )
    return send_email(to_email, subject, text, html)


def notify_results_ready(recipients, collab_name, collab_uuid):
    """Tell all participants that GWAS results are ready."""
    link = f"{app_base_url()}/collaboration/{collab_uuid}"
    subject = f"Results are ready: {collab_name}"
    text = (
        f"The analysis for \"{collab_name}\" has finished and results are ready to view.\n\n"
        f"Open the collaboration to see the results:\n{link}\n"
    )
    html = (
        f"<p>The analysis for \"<b>{collab_name}</b>\" has finished and results are ready to view.</p>"
        f"<p><a href=\"{link}\">Open the collaboration to see the results</a>.</p>"
    )
    return send_email(recipients, subject, text, html)


def notify_collaboration_started(recipients, collab_name, collab_uuid):
    """Tell all participants the study has started (everyone invited has responded)."""
    link = f"{app_base_url()}/collaboration/{collab_uuid}"
    subject = f"The study has started: {collab_name}"
    text = (
        f"Everyone invited to \"{collab_name}\" has responded, so the study has started.\n\n"
        f"Keep your Site Agent (helper) running — your quality-control step runs automatically "
        f"on your machine. Track progress here:\n{link}\n"
    )
    html = (
        f"<p>Everyone invited to \"<b>{collab_name}</b>\" has responded, so the study has started.</p>"
        f"<p>Keep your Site Agent (helper) running — your quality-control step runs automatically "
        f"on your machine. <a href=\"{link}\">Track progress here</a>.</p>"
    )
    return send_email(recipients, subject, text, html)


def notify_action_needed(to_email, collab_name, collab_uuid, what):
    """Nudge the participant the study is currently waiting on (e.g. their QC/counts)."""
    link = f"{app_base_url()}/collaboration/{collab_uuid}"
    subject = f"Action needed: {collab_name} is waiting on you"
    text = (
        f"The study \"{collab_name}\" is waiting on your computer to finish {what}.\n\n"
        f"Please make sure your Site Agent (helper) is running and your dataset folder is in "
        f"place — it will then complete this step automatically. Details:\n{link}\n"
    )
    html = (
        f"<p>The study \"<b>{collab_name}</b>\" is waiting on your computer to finish <b>{what}</b>.</p>"
        f"<p>Please make sure your Site Agent (helper) is running and your dataset folder is in "
        f"place — it will then complete this step automatically. <a href=\"{link}\">Details</a>.</p>"
    )
    return send_email(to_email, subject, text, html)


def notify_stage_advanced(to_email, collab_name, collab_uuid, status_text, next_action):
    """Tell the initiator a stage finished and what to do next on the website."""
    link = f"{app_base_url()}/collaboration/{collab_uuid}"
    subject = f"{collab_name}: {status_text}"
    text = (
        f"Update on \"{collab_name}\": {status_text}.\n\n"
        f"Next step: {next_action} on the collaboration page:\n{link}\n"
    )
    html = (
        f"<p>Update on \"<b>{collab_name}</b>\": {status_text}.</p>"
        f"<p>Next step: <b>{next_action}</b> on the "
        f"<a href=\"{link}\">collaboration page</a>.</p>"
    )
    return send_email(to_email, subject, text, html)


def notify_generate_stats(to_email, collab_name, collab_uuid):
    """Tell a participant it's their turn to generate stat data (after QC / threshold)."""
    link = f"{app_base_url()}/collaboration/{collab_uuid}"
    subject = f"Your turn: generate stat data for {collab_name}"
    text = (
        f"Quality control is complete for \"{collab_name}\" and the threshold is set.\n\n"
        f"Open the collaboration and click \"Create GWAS dataset\" to generate your stat "
        f"data — your Site Agent computes it locally and uploads only the counts.\n{link}\n"
    )
    html = (
        f"<p>Quality control is complete for \"<b>{collab_name}</b>\" and the threshold is set.</p>"
        f"<p>Open the collaboration and click <b>Create GWAS dataset</b> to generate your stat "
        f"data — your Site Agent computes it locally and uploads only the counts.</p>"
        f"<p><a href=\"{link}\">Open the collaboration</a></p>"
    )
    return send_email(to_email, subject, text, html)
