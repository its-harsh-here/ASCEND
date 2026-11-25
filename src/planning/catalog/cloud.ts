import { boss, f, m, q, side, type GoalTemplate } from './types';

export const linux: GoalTemplate = {
  id: 'linux',
  name: 'Linux & Shell Mastery',
  domain: 'cloud',
  summary: 'Become fluent in the Linux command line, permissions, processes and shell scripting.',
  icon: 'terminal',
  keywords: ['linux', 'bash', 'shell scripting', 'command line', 'terminal', 'unix'],
  skillIds: ['linux'],
  milestones: [
    m('basics', 'Command-line foundations', [
      f('fs', 'Navigate the filesystem hierarchy', 1.5, 'easy', 'Cheat sheet of 25 commands you used (ls, cd, find, grep, less…)', 'Explore /etc, /var, /home; practise paths, globbing and man pages.'),
      f('perm', 'Users, groups and permissions', 1.5, 'medium', 'Script that creates a user, group and a shared directory with correct chmod/chown', 'Understand rwx, octal modes, umask, sudo and ownership.'),
      q('text', 'Text processing pipelines', 2, 'medium', 'Five one-liners using grep, sed, awk, sort, uniq and xargs on real logs', 'Compose pipes and redirection to answer questions about log files.'),
    ]),
    m('system', 'Processes and services', [
      q('proc', 'Processes, signals and job control', 1.5, 'medium', 'Notes explaining ps, top, kill signals, nice and background jobs', 'Inspect and control running processes.'),
      q('systemd', 'Manage services with systemd', 1.5, 'medium', 'A custom systemd unit that runs and restarts a small script', 'Write a unit file, use journalctl to debug it.'),
      q('pkg', 'Package management and disks', 1, 'easy', 'Inventory of installed packages, disk usage report with df/du', 'apt/dnf, mounting, disk usage, logs rotation.'),
    ]),
    m('script', 'Automation', [
      q('bash', 'Bash scripting essentials', 2.5, 'hard', 'Backup script with arguments, error handling (set -euo pipefail) and logging', 'Variables, conditionals, loops, functions and exit codes.'),
      side('ssh', 'SSH keys and remote administration', 1, 'easy', 'Passwordless SSH to a VM with a hardened sshd_config', 'Key pairs, config files, scp/rsync.'),
      boss('boss', 'Boss: Automate a server setup', 3, 'boss', 'Idempotent script that provisions a fresh VM (users, firewall, service, cron)', 'Combine everything into a reproducible provisioning script.'),
    ]),
  ],
};

export const networking: GoalTemplate = {
  id: 'networking',
  name: 'Computer Networking',
  domain: 'cloud',
  summary: 'Understand how packets move: TCP/IP, DNS, HTTP, TLS, subnets and troubleshooting.',
  icon: 'router',
  keywords: ['networking', 'computer networks', 'tcp/ip', 'tcp', 'dns', 'subnet', 'osi model'],
  skillIds: ['networking'],
  milestones: [
    m('layers', 'Models and addressing', [
      f('osi', 'OSI and TCP/IP models', 1.5, 'easy', 'One-page diagram mapping protocols to layers', 'Learn what happens at each layer and why.'),
      q('ip', 'IPv4, CIDR and subnetting', 2, 'medium', '20 solved subnetting exercises', 'Network/host bits, CIDR notation, private ranges, NAT.'),
      q('tcp', 'TCP vs UDP and the handshake', 1.5, 'medium', 'Wireshark capture annotated with SYN/ACK/FIN', 'Ports, sockets, reliability, congestion control basics.'),
    ]),
    m('app', 'Application protocols', [
      q('dns', 'DNS resolution end to end', 1.5, 'medium', 'dig traces for three domains explained step by step', 'Records (A, AAAA, CNAME, MX, TXT), TTL and recursion.'),
      q('http', 'HTTP/1.1, HTTP/2 and TLS', 2, 'medium', 'curl -v walkthrough and certificate chain explained', 'Methods, status codes, headers, TLS handshake.'),
      side('tools', 'Troubleshooting toolkit', 1, 'easy', 'Runbook using ping, traceroute, ss, nc and tcpdump', 'Diagnose connectivity issues systematically.'),
      boss('boss', 'Boss: Explain "what happens when you type a URL"', 2, 'boss', 'Written explanation (1,500 words) with diagrams covering DNS→TCP→TLS→HTTP', 'Synthesize the full journey of a web request.'),
    ]),
  ],
};

export const docker: GoalTemplate = {
  id: 'docker',
  name: 'Docker & Containers',
  domain: 'cloud',
  summary: 'Containerize applications with Docker: images, volumes, networks, Compose and best practices.',
  icon: 'container',
  keywords: ['docker', 'containers', 'containerization', 'dockerfile', 'docker compose', 'containerize'],
  skillIds: ['docker'],
  requires: [{ template: 'linux', milestone: 'basics' }],
  milestones: [
    m('basics', 'Container fundamentals', [
      f('concepts', 'Containers vs virtual machines', 1, 'easy', 'Notes on namespaces, cgroups, images and layers', 'Understand what a container really is.'),
      f('install', 'Install Docker and run your first containers', 1, 'easy', 'Run nginx, redis and an interactive Ubuntu shell; list/stop/remove them', 'Get comfortable with docker run, ps, logs, exec, rm.'),
      q('cli', 'Master the Docker CLI', 1.5, 'medium', 'Personal command reference with 20 commands and flags', 'Port mapping, env vars, restart policies, inspect.'),
    ]),
    m('images', 'Building images', [
      q('dockerfile', 'Write a Dockerfile for a web app', 2, 'medium', 'Containerized app from your own code, running on localhost', 'FROM, COPY, RUN, CMD, ENTRYPOINT, .dockerignore.'),
      q('multistage', 'Multi-stage builds and image size optimization', 1.5, 'hard', 'Image reduced by ≥50% with a multi-stage build; before/after sizes recorded', 'Slim bases, layer caching, non-root users.'),
      side('registry', 'Push images to a registry', 1, 'easy', 'Tagged image published on Docker Hub or GHCR', 'Tagging strategy, login, push and pull.'),
    ]),
    m('data-net', 'Storage and networking', [
      q('volumes', 'Volumes and bind mounts', 1.5, 'medium', 'Postgres container whose data survives container removal', 'Persist state safely.'),
      q('networks', 'Docker networks', 1.5, 'medium', 'Two containers communicating over a user-defined bridge network', 'Bridge, host, DNS-based service discovery.'),
    ]),
    m('compose', 'Docker Compose', [
      q('compose', 'Define a multi-service stack with Compose', 2.5, 'hard', 'docker-compose.yml with app, database and cache, health checks and env files', 'Services, depends_on, profiles, override files.'),
      side('security', 'Container security checklist', 1, 'medium', 'Scan report (e.g. Trivy) and fixes applied', 'Image scanning, secrets handling, least privilege.'),
      boss('boss', 'Boss: Containerize a full-stack project', 3, 'boss', 'Repository with Dockerfiles, Compose stack and README instructions', 'Ship a reproducible local environment for a real project.'),
    ]),
  ],
};

export const kubernetes: GoalTemplate = {
  id: 'kubernetes',
  name: 'Kubernetes Orchestration',
  domain: 'cloud',
  summary: 'Deploy and operate containerized workloads on Kubernetes.',
  icon: 'ship-wheel',
  keywords: ['kubernetes', 'k8s', 'kubectl', 'helm', 'container orchestration', 'minikube'],
  skillIds: ['kubernetes'],
  requires: [{ template: 'docker', milestone: 'images' }],
  milestones: [
    m('arch', 'Cluster fundamentals', [
      f('arch', 'Kubernetes architecture', 1.5, 'medium', 'Diagram of control plane and node components with responsibilities', 'API server, etcd, scheduler, kubelet, kube-proxy.'),
      q('local', 'Set up a local cluster (kind or minikube)', 1.5, 'medium', 'Running cluster; kubectl get nodes output saved', 'Install tooling and configure kubectl contexts.'),
      q('pods', 'Pods, labels and namespaces', 2, 'medium', 'YAML manifests for a pod with labels, probes and resource limits', 'The smallest deployable unit and how to organize it.'),
    ]),
    m('workloads', 'Workloads and networking', [
      q('deploy', 'Deployments, ReplicaSets and rollouts', 2, 'hard', 'Rolling update and rollback demonstrated on a sample app', 'Declarative updates and self-healing.'),
      q('services', 'Services and Ingress', 2, 'hard', 'App reachable through an Ingress with path routing', 'ClusterIP, NodePort, LoadBalancer, Ingress controllers.'),
      q('config', 'ConfigMaps and Secrets', 1.5, 'medium', 'App reading config and secrets from the cluster', 'Externalize configuration.'),
    ]),
    m('ops', 'Operations', [
      q('storage', 'Persistent volumes and StatefulSets', 2, 'hard', 'Database running on a PVC that survives pod restarts', 'Storage classes, PVCs and stateful workloads.'),
      q('helm', 'Package an app with Helm', 2, 'hard', 'Helm chart with values for dev and prod', 'Templating, releases and upgrades.'),
      side('observe', 'Observability basics', 1.5, 'medium', 'kubectl top, logs and events used to debug a broken deployment', 'Debug CrashLoopBackOff and pending pods.'),
      boss('boss', 'Boss: Deploy a multi-service app to Kubernetes', 4, 'boss', 'Manifests or Helm chart deploying your Compose project with Ingress and persistence', 'Production-like deployment of a real application.'),
    ]),
  ],
};

export const aws: GoalTemplate = {
  id: 'aws',
  name: 'AWS Cloud Practitioner → Builder',
  domain: 'cloud',
  summary: 'Learn core AWS services and deploy real infrastructure within the free tier.',
  icon: 'cloud',
  keywords: ['aws', 'amazon web services', 'cloud computing', 'ec2', 's3', 'lambda', 'cloud practitioner', 'solutions architect'],
  skillIds: ['aws'],
  requires: [{ template: 'networking', milestone: 'layers' }],
  milestones: [
    m('core', 'Cloud and account foundations', [
      f('cloud', 'Cloud concepts and the shared responsibility model', 1, 'easy', 'Summary of IaaS/PaaS/SaaS, regions and AZs', 'Vocabulary and mental models for cloud.'),
      q('account', 'Secure your AWS account', 1.5, 'medium', 'MFA enabled, billing alarm set, admin IAM user created (no root use)', 'Free-tier safety first: budgets and alerts.'),
      q('iam', 'IAM users, roles and policies', 2, 'hard', 'Least-privilege policy JSON written and tested with the policy simulator', 'Identities, policies, roles and STS.'),
    ]),
    m('compute', 'Compute, storage and networking', [
      q('ec2', 'Launch and connect to EC2', 2, 'medium', 'Web server on EC2 reachable via a security group', 'AMIs, instance types, key pairs, user data.'),
      q('s3', 'S3 buckets and static hosting', 1.5, 'medium', 'Static website hosted on S3 with a bucket policy', 'Storage classes, versioning, lifecycle rules.'),
      q('vpc', 'Design a VPC', 2.5, 'hard', 'VPC with public/private subnets, route tables and NAT diagrammed and built', 'Subnets, gateways, NACLs and security groups.'),
    ]),
    m('managed', 'Managed and serverless services', [
      q('rds', 'Managed databases with RDS / DynamoDB', 2, 'medium', 'App connected to RDS or DynamoDB', 'Choosing between relational and NoSQL.'),
      q('lambda', 'Serverless with Lambda and API Gateway', 2.5, 'hard', 'REST endpoint backed by a Lambda function', 'Event-driven compute, permissions and cold starts.'),
      side('cw', 'Monitoring with CloudWatch', 1, 'easy', 'Dashboard and alarm for your Lambda/EC2', 'Metrics, logs and alarms.'),
      side('cert', 'Practice exam: Cloud Practitioner', 2, 'medium', 'Practice test score ≥ 80%', 'Validate your knowledge against the certification blueprint.'),
      boss('boss', 'Boss: Deploy a production-style app on AWS', 4, 'boss', 'Architecture diagram + deployed app (e.g. S3 frontend, API Gateway + Lambda, DynamoDB), cost estimate', 'Bring the services together into one design.'),
    ]),
  ],
};

export const devops: GoalTemplate = {
  id: 'devops',
  name: 'CI/CD & Infrastructure as Code',
  domain: 'cloud',
  summary: 'Automate builds, tests and deployments; describe infrastructure as code.',
  icon: 'infinity',
  keywords: ['devops', 'ci/cd', 'cicd', 'github actions', 'terraform', 'infrastructure as code', 'jenkins'],
  skillIds: ['devops'],
  requires: [{ template: 'docker', milestone: 'images' }],
  milestones: [
    m('ci', 'Continuous integration', [
      q('gha', 'GitHub Actions workflows', 2, 'medium', 'Workflow running lint and tests on every pull request', 'Triggers, jobs, caching and matrices.'),
      q('cd', 'Continuous delivery pipeline', 2, 'hard', 'Pipeline building a Docker image and deploying on merge', 'Environments, secrets and approvals.'),
    ]),
    m('iac', 'Infrastructure as code', [
      q('tf', 'Terraform fundamentals', 2.5, 'hard', 'Terraform config provisioning a small stack with remote state', 'Providers, resources, state, plan/apply.'),
      side('obs', 'Monitoring and alerting', 1.5, 'medium', 'Health-check endpoint and uptime alert configured', 'SLIs, dashboards and alert hygiene.'),
      boss('boss', 'Boss: One-command deploy', 3, 'boss', 'Repository where a merge provisions and deploys the app automatically', 'Glue CI, CD and IaC together.'),
    ]),
  ],
};
