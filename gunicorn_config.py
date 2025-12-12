import multiprocessing

workers = multiprocessing.cpu_count() * 2 + 1
bind = 'unix:lpc.sock'
umask = 0o007
reload = True
import multiprocessing

# Gunicorn server binding
bind = "127.0.0.1:5000"

# Number of worker processes
workers = multiprocessing.cpu_count() * 2 + 1

# Optional: allow Gunicorn to reload on code changes (useful during development)
reload = True

# Optional: control file permissions (not needed when using TCP bind)
# umask = 0o007

# Logging
accesslog = "-"   # Logs to stdout
errorlog = "-"    # Logs to stderr
loglevel = "info"

#logging
accesslog = '-'
errorlog = '-'
