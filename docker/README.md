# Independent nodics.circa.eWaste container

Run `docker compose -f docker/compose.yaml up --build -d` from this frontend repository. The image build and static server do not require a backend checkout or healthy backend services. The application displays its own unavailable/retry state when APIs cannot be reached.

This local example uses the published Docker backend API ports (5300 onwards). Configure public runtime JSON for Axis/Nexus, or the Dockerfile build inputs and nginx upstreams for storefronts, for another deployment. No secrets belong in browser configuration. Nginx resolves API upstreams when requests arrive so backend downtime cannot prevent static frontend startup.

Run this application's existing tests and build from its repository. Backend acceptance does not invoke frontend verification.
