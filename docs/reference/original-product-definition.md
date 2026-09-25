# Original working product definition

**Status: Archived source**

This is the original product-definition input preserved for provenance. It has
been reorganized and refined into the canonical documentation linked from the
[documentation map](../README.md). Its inline citation markers came from the
source and are not usable repository references. Current operational facts and
decisions override outdated suggestions in this archive.

---

# Commandry

## Your Personal Control Plane

### Working product definition

**Commandry is a personal operations system that connects projects, knowledge, infrastructure, services, automations, monitoring, and AI agents into one central control plane.**

It should answer three questions extremely well:

1. **What is going on?**
2. **What should happen next?**
3. **Can I or an agent do something about it?**

Commandry is not simply a project-management application, second-brain application, infrastructure dashboard, monitoring tool, or AI-agent orchestrator.

It sits **above all of them**.

The long-term goal is to create something resembling a practical personal JARVIS: not necessarily one omnipotent agent, but a system that understands the user's world well enough to provide context to humans and agents, monitor that world continuously, surface work, and eventually execute approved work through specialized agents.

---

# 1. Core philosophy

Commandry should become the **system of understanding and control** while many external services remain the systems of record.

GitHub should still own Git repositories.

Home Assistant should still control the smart home.

Proxmox should still control virtual machines.

AMP should still manage game-server instances.

Vercel should still deploy applications.

Google Search Console should still own search-performance data.

External monitoring systems can still perform monitoring.

Existing project-management systems used by employers or clients can remain authoritative.

Commandry should ingest, normalize, link, summarize, and act on those systems rather than unnecessarily recreating every underlying product.

This is very similar to Everview's concept of sitting above existing work systems rather than trying to replace them. Its execution model builds an understanding layer over tools such as Jira and GitHub while the original tools remain authoritative. That is a particularly useful philosophical reference for Commandry. citeturn432114search8

---

# 2. The fundamental object model

One of the most important architectural decisions should be avoiding the assumption that everything is a traditional software project.

Commandry needs a flexible hierarchy.

A useful starting model is:

**Domain**
→ **Project / System**
→ **Resource / Component**
→ **Work / Knowledge / Activity**

For example:

### Personal
- Elopement
- Halloween 2026
- Trips
- Home projects
- Purchases/research

### Software
- ResuPals
- Personal websites
- Other web applications
- Internal tools

### Work
- Job / Client A
  - CRM
  - Workstream
- Job / Client B
  - Project(s)

### Home
- Home Assistant
- Automations
- Smart devices
- Home network

### Infrastructure
- Homelab
- Cloud infrastructure
- Game hosting
- Dedicated servers
- VPSs
- Domains
- DNS
- Deployment platforms

A project therefore does not need to mean “repository.”

A project is simply **something with ongoing context, state, resources, activity, knowledge, or work associated with it.**

---

# 3. Why Backstage is an important architectural reference

Backstage may be one of the most useful references for Commandry's internal information model even though its end-user experience is not what Commandry should look like.

Backstage models:

- **Domains**
- **Systems**
- **Components**
- **APIs**
- **Resources**

Resources explicitly include physical and virtual infrastructure, while systems group cooperating components and resources into understandable units. citeturn596209search3turn596209search6

Commandry can generalize that concept beyond software.

For example:

**Domain:** Infrastructure  
**System:** Game Hosting  
**Resource:** Dedicated Server A  
**Resource:** VM 104  
**Component:** AMP Controller  
**Component:** Minecraft Production  
**Component:** Minecraft Testing

Or:

**Domain:** Personal  
**System:** Halloween 2026  
**Component:** Haunted Hotel Website  
**Component:** Decorations  
**Component:** Food  
**Resource:** Guest List  
**Resource:** Shopping List

The same underlying graph can describe both without forcing them into identical workflows.

---

# 4. The Commandry home dashboard

Opening Commandry should immediately answer:

### What needs my attention?

Examples:

- 3 tasks waiting on me
- 2 agents blocked awaiting approval
- 1 service degraded
- 1 server approaching disk capacity
- 4 upcoming deadlines
- 3 scheduled automations running tonight
- search traffic changed materially on a website
- an agent completed a long-running task overnight
- a recurring task failed
- a project has not been touched in three weeks
- a captured idea has not yet been triaged

### What changed?

A unified activity stream could contain:

- GitHub PR merged
- service went offline
- service recovered
- deployment completed
- new note captured
- agent completed task
- automation ran
- task moved to Done
- Search Console impressions increased
- server disk usage crossed threshold
- Home Assistant automation failed
- scheduled reminder became due

### What can I do next?

Commandry should surface work rather than merely display data.

For example:

> ResuPals  
> Search impressions are up 24% over the last seven days.  
> 3 SEO tasks remain open.

or:

> Homelab  
> Coolify VM storage is at 81%.  
> You previously noted that old deployment artifacts should be cleaned up.

Buttons could include:

**View**
**Create task**
**Ask agent**
**Run automation**
**Ignore**
**Remind me later**

---

# 5. Quick Capture

Quick Capture should be one of Commandry's most important features.

The user should be able to dump information into Commandry without first deciding where it belongs.

Input could include:

- short text
- long rambling note
- screenshot
- photo
- URL
- pasted conversation
- voice transcription
- file
- email
- GitHub link
- command from an AI agent

Example:

> Coolify cleanup: I think we have a bunch of scheduled jobs and stale deployment stuff that should eventually be cleaned up. Don't want to deal with this now.

Commandry could infer:

**Project:** Homelab  
**System:** Coolify  
**Type:** Task / idea  
**Priority:** Low  
**Execution:** Deferred  
**Requires planning:** Yes

It could preserve the original input while creating structured information from it.

The critical rule should be:

**AI organization must never destroy the raw thought.**

The original capture stays available as evidence.

---

# 6. Inbox and AI triage

Anything Commandry cannot confidently classify goes into an Inbox.

The triage agent can propose:

- project
- task vs note vs reference vs idea
- relationships
- priority
- due date
- tags
- whether this is actionable
- whether an existing task already covers it
- whether an automation might make sense
- whether an agent could probably perform it

The user should be able to approve multiple suggestions quickly.

Eventually high-confidence classifications could happen automatically.

This gives Commandry the fluid capture experience of a second brain without forcing the user to manually organize everything like traditional Notion databases.

---

# 7. Project workspace

Every project should have its own focused workspace.

A project could expose tabs such as:

**Overview | Work | Knowledge | Activity | Resources | Infrastructure | Automations | Agents | Integrations**

Not every project needs every tab.

For a trip, Infrastructure may disappear.

For a Proxmox environment, Infrastructure may become the primary view.

For a work project, Work and Knowledge may dominate.

For an event, Overview, Tasks, Schedule, People, Shopping, and Notes may make more sense.

The underlying system stays consistent while the presentation adapts.

---

# 8. Project Overview

The project landing page should be configurable with widgets.

Examples:

- project status
- next actions
- task counts
- recent decisions
- project briefing
- important links
- upcoming dates
- deployment status
- GitHub activity
- infrastructure health
- uptime
- analytics
- recent agent runs
- notes
- outstanding approvals
- spending/cost
- custom metrics

Lodestar's **Agent Widgets** feature is particularly relevant here. It lets a user describe a dashboard card in natural language, has an agent build it, refreshes it on a schedule, and allows that agent to access connected MCP servers. citeturn596209search1

Commandry could eventually offer:

> Add widget: Show ResuPals Google Search Console clicks and impressions for the last 30 days versus the previous 30 days.

or:

> Show RAM, CPU, disk usage and network traffic for every game-server instance on Atlas.

The agent produces the widget configuration while the dashboard renders cached structured data.

---

# 9. Work management

Commandry needs project-management capabilities, but they should remain lightweight enough for personal usage.

Core concepts:

- Tasks
- Subtasks
- Larger initiatives/epics
- Status
- Priority
- Due dates
- Dependencies
- Blocking relationships
- Tags
- Project relationships
- Agent assignment
- Human assignment
- recurring tasks
- execution history
- notes/comments
- attachments
- acceptance criteria

Views should include:

- List
- Board/Kanban
- Table
- Calendar
- Timeline
- “Today”
- “Waiting”
- “Agent Ready”
- “Overnight”
- “Someday”

Plane is an excellent reference here. It combines work items, projects, cycles, modules, pages, intake/triage, multiple layouts, APIs and webhooks. It also now exposes MCP capabilities to agents. citeturn529892search0turn596209search5

Plane's AI Actions model is also worth borrowing: natural-language changes are converted into structured operations and presented for review before execution. citeturn529892search6

AppFlowy is useful for another reason: one structured database can be represented as table, Kanban, calendar, etc., rather than creating unrelated data stores for every view. citeturn529892search1turn529892search17

Commandry should follow that model.

**One task object. Many views.**

---

# 10. Knowledge and project memory

Every project should accumulate durable context.

Potential knowledge types:

- Notes
- Decisions
- Ideas
- Research
- Requirements
- Architecture
- Links
- Screenshots
- Conversations
- Prompt fragments
- Instructions
- Credentials references
- Meeting notes
- Runbooks
- Documents
- Lessons learned

The important part is linking knowledge to the project rather than merely keeping a giant notebook.

Commandry should eventually generate a **Project Brief** such as:

### Current state
What exists right now.

### Recent changes
What has happened since the user's last meaningful interaction.

### Decisions
Important decisions and why they were made.

### Open questions
Things that still need an answer.

### Blockers
What cannot continue.

### Next actions
The most likely things to work on.

### Agent context
Information an agent should know before touching the project.

This becomes the antidote to reopening something after three weeks and thinking:

> What the hell was I doing here?

---

# 11. Execution packets

One particularly important feature should be the ability to transform a task into a portable **Execution Packet**.

Instead of copying a bare task title into Codex or another agent, Commandry generates:

### Objective
What should be accomplished.

### Context
Why this exists.

### Relevant project knowledge
Architecture, notes, decisions, links.

### Resources
Repository, server, environment, files, APIs.

### Constraints
What must not change.

### Acceptance criteria
How completion will be evaluated.

### Suggested tools
Codex, browser, SSH, MCP, etc.

### Permissions
What the agent may access.

The packet can then be:

- copied as Markdown
- fetched through API
- exposed through MCP
- assigned directly to an agent
- attached to a Paperclip issue
- sent to a coding agent

Eventually manual copy/paste disappears.

---

# 12. MCP should be a first-class interface

Commandry should expose an MCP server.

Agents could ask:

> List active projects.

> Give me the current context for ResuPals.

> What open infrastructure tasks exist?

> Create a task to clean old Coolify scheduled jobs.

> Record that we decided to consolidate the Resend accounts later.

> Get the infrastructure associated with this repository.

> Mark this task blocked because I need Isaac to provide a credential.

This lets Commandry become a persistent shared brain across Codex, Claude, Hermes, OpenClaw, Paperclip, or future tools.

The UI is then only one interface to the underlying system.

---

# 13. Infrastructure should be modeled as a graph/tree

Infrastructure should not be represented as a flat list of servers.

A parent-child model is essential.

Example:

**Infrastructure**
└── **OVH**
    └── **Atlas**
        ├── **Proxmox**
        │   ├── VM 102
        │   │   └── Coolify
        │   │       ├── Website A
        │   │       ├── Website B
        │   │       └── Database
        │   ├── VM 103
        │   └── LXC 104
        └── Storage

Another:

**Game Hosting**
└── **Dedicated Server**
    └── **AMP Controller**
        ├── Minecraft Production
        ├── Minecraft Testing
        ├── Palworld
        └── Other instance

The hierarchy should support arbitrary entity types:

- Provider
- Account
- Datacenter
- Physical server
- Dedicated server
- Cluster
- Hypervisor
- VM
- LXC
- Docker host
- Container
- Application
- Game-server instance
- Database
- Network device
- Service
- Website
- API
- Custom resource

A resource can also belong to a project.

For example:

`ResuPals -> production web deployment -> Vercel`

while that Vercel account can independently exist inside:

`Infrastructure -> SaaS Providers -> Vercel`.

Relationships should therefore be graph-based even if the common UI presents them as a tree.

Backstage's Resource/Component/System model is an excellent starting point for this abstraction. citeturn596209search3turn596209search7

---

# 14. Infrastructure Explorer

The infrastructure UI could provide:

### Collapsed view

**Atlas**
🟢 Healthy  
CPU 18% · RAM 42% · Storage 63%  
↓ 14 Mbps · ↑ 3 Mbps  
7 children

Click or expand:

**Atlas**
- 🟢 Coolify VM
- 🟢 Home Assistant VM
- 🟡 Game Host
  - 🟢 Minecraft
  - 🔴 Palworld
- 🟢 Monitoring

Individual resources could show:

- current state
- uptime
- CPU
- RAM
- disk
- disk I/O
- network receive/transmit
- temperature
- process/container count
- IPs
- provider
- location
- operating system
- updates available
- alerts
- dependencies
- children
- parent
- associated project
- recent events

Users should be able to choose whether child resources appear expanded by default.

---

# 15. Infra Agent

The existing **Infra Agent** concept fits inside Commandry as the beginning of the infrastructure collector/observability layer.

From the functionality described so far, Infra Agent covers a subset of the larger Commandry vision:

- uptime/state
- infrastructure monitoring
- traffic/usage visualization
- machine information
- service health

Commandry should not throw that concept away.

A natural architecture would be:

**Commandry**
→ infrastructure integration layer
→ Infra Agent / collector(s)
→ machines and services

That could evolve into a tiny collector deployed on systems that need deeper local metrics.

I could not locate the actual Infra Agent repository by that name through the connected GitHub repositories or the available file library, so this section is based on the functionality described rather than an inspection of its implementation.

---

# 16. Beszel and Netdata

Beszel is probably the closest reference for what the lightweight Infra Agent collector could become.

Beszel uses a hub/agent model and collects host and Docker information including CPU, memory, disk, I/O, networking, containers and historical metrics while supporting alerts and an API. citeturn971528search14

Commandry could either:

1. integrate Beszel;
2. borrow its collector architecture;
3. allow Infra Agent to normalize the same class of telemetry.

Netdata represents the deeper end of the spectrum.

Its interface provides centralized nodes, charts, metrics, live data, logs, dashboards, alerts and events. Its Nodes view provides centralized status and node hierarchy, while its alerting system attaches warnings and critical alerts to individual nodes/components. citeturn596209search12turn596209search13turn596209search9

Commandry should **not recreate Netdata in its entirety**.

Instead:

- show important metrics natively;
- surface alerts;
- retain historical summaries;
- deep-link or embed detailed observability when needed.

Commandry provides the **overview and context**.

Netdata/Beszel/Infra Agent provide the **telemetry**.

---

# 17. UptimeRobot-style external monitoring

Commandry should also understand that internal system metrics and external availability are different.

A service can have healthy CPU and RAM while still being inaccessible from the internet.

UptimeRobot is a useful reference because its monitoring model is simple:

- HTTP/S
- Ping
- Port
- Keyword/content
- DNS
- API assertions

Its API monitoring can inspect JSON values, headers, status codes, authentication and request bodies rather than merely checking whether an endpoint answered. citeturn596209search2turn596209search4

Commandry should support similar concepts through native monitoring or integration.

Example:

**ResuPals**
- Website: 🟢
- API: 🟢
- Database: 🟢
- Email: 🟢
- Search indexing: 🟢

If something changes:

> 🔴 ResuPals API has failed three checks over four minutes.

That event becomes part of the project's activity timeline and could optionally wake an agent.

---

# 18. Proxmox hierarchy

For Proxmox environments, Commandry should be able to represent:

**Cluster**
→ **Node**
→ **QEMU VM / LXC**
→ **services inside guest**

At the overview level:

- node online/offline
- guest counts
- CPU
- RAM
- storage
- uptime
- network

Then the user clicks a VM and sees its deeper metrics and associated services.

Homepage already demonstrates that a lightweight dashboard integration can retrieve Proxmox QEMU/LXC counts and CPU/memory information through the Proxmox integration. citeturn432114search11

Commandry would take this substantially further by attaching those resources to projects, activity, alerts, knowledge and agent permissions.

---

# 19. AMP and game hosting

The product is **CubeCoders AMP**, not “Kube Coder.”

AMP is particularly useful because it exposes an API and instance-level information. Its API documentation exposes a JSON API, while existing clients/exporters demonstrate retrieval of AMP instances and metrics such as application state, disk usage, uptime, CPU, memory, active players and player limits. citeturn432114search13turn432114search12turn432114search5

That maps almost perfectly onto Commandry's hierarchy:

**Physical/Dedicated Server**
→ **AMP**
→ **Instance**
→ **Game Server**

Example card:

### Minecraft Production
🟢 Running  
4 / 20 players  
CPU 31%  
RAM 6.2 / 12 GB  
Disk 44 GB  
Uptime 5d 13h  
Network ↓ 2.4 Mbps ↑ 900 Kbps

Then:

**Open AMP**
**Restart**
**View logs**
**Create task**
**Ask agent**

Actions would be permission-gated.

---

# 20. Service and application integrations

Infrastructure is only one type of operational data.

Projects should also be able to connect:

- GitHub
- Vercel
- Cloudflare
- Google Search Console
- Google Analytics
- Resend
- Sentry
- databases
- DNS providers
- uptime systems
- Home Assistant
- Proxmox
- AMP
- Docker
- Coolify
- Netdata
- Beszel
- external APIs
- custom webhooks

The integration layer should normalize external information into:

**Resource**
**Metric**
**Event**
**Alert**
**Action**

That common abstraction prevents every integration from creating an entirely different UI.

---

# 21. Analytics

A software project dashboard might display:

### Traffic
Visitors, page views, acquisition.

### Search
Clicks, impressions, average position, indexed pages.

### Application
Deployments, errors, latency.

### Infrastructure
Uptime, CPU, RAM, storage.

### Communications
Emails sent, delivery/bounces.

### Development
PRs, commits, open issues.

### Work
Tasks and project progress.

Commandry can then correlate otherwise disconnected events.

For example:

> Traffic increased 42% after deployment `abc123`.

or:

> Search impressions increased significantly while CTR fell.

Eventually an agent could proactively create a research task from that signal.

---

# 22. Events and signals

Almost everything external should ultimately create a normalized **Event**.

Examples:

- monitor.down
- monitor.recovered
- deployment.completed
- deployment.failed
- git.pr.merged
- server.cpu.threshold
- server.disk.threshold
- agent.run.completed
- agent.run.failed
- task.created
- task.completed
- analytics.anomaly
- automation.completed
- secret.expiring

Events feed:

- timelines
- notifications
- automations
- dashboards
- agents
- historical analysis

This becomes the nervous system of Commandry.

---

# 23. Automations

Commandry should centralize recurring and scheduled work.

Automation types:

### One-time
“Remind me Friday.”

### Recurring
“Every Sunday, summarize infrastructure health.”

### Condition-based
“Tell me when this product drops under $300.”

### Monitoring
“Alert if this server stays offline for three minutes.”

### Agent routine
“Every Monday, inspect all active projects for stale tasks.”

### Overnight work
“Run these agent tasks after midnight.”

### Event-based
“When a deployment fails, collect logs and open an investigation task.”

There should be an **Automations** screen showing:

- next run
- last run
- status
- project
- agent
- trigger
- history
- output
- errors
- cost/usage

This solves the current problem of scheduled tasks existing in numerous unrelated services with no central understanding of them.

---

# 24. The Overnight Queue

Commandry should explicitly understand the difference between work requiring active user interaction and unattended work.

Tasks could have an execution profile:

### Interactive
Likely requires questions or decisions.

### Short autonomous
Can safely execute now.

### Long autonomous
May take significant time but needs little input.

### Overnight
Best executed while the user is away.

### Scheduled
Must execute at a certain time.

### Watch
Runs only when a condition becomes true.

An “Overnight Queue” might contain:

- run repository audit
- research competitors
- inspect logs
- generate documentation
- analyze Search Console
- scan stale infrastructure
- prepare refactor proposal
- update project briefs

The following morning Commandry produces:

### Overnight Brief

**5 runs completed**
**1 failed**
**1 needs approval**

rather than forcing the user to inspect five separate AI applications.

---

# 25. Agent orchestration

Agents should be first-class entities.

An agent can have:

- Name
- Runtime/provider
- Model
- Role
- Skills
- Projects
- Permissions
- Tools
- Secret access
- Budget
- Autonomy level
- Schedule
- Current run
- Run history

Example:

### Homelab Agent
Runtime: Hermes  
Projects: Homelab, Game Hosting  
Access: infrastructure read, SSH selected hosts  
Autonomy: propose changes  
Secrets: homelab namespace  
Status: Idle

### ResuPals Coding Agent
Runtime: Codex  
Repository: ResuPals  
Autonomy: branch/commit/test  
Production changes: approval required

---

# 26. Paperclip is the strongest execution reference

Paperclip is extremely relevant to this layer.

It models goals, projects, tasks, agent hierarchy, budgets, approvals and execution. Agents wake through **heartbeats**, perform a bounded piece of work, report status and then stop. Heartbeats can be triggered by schedules, task assignments, mentions and approvals. citeturn529892search4turn529892search7

Paperclip also maintains task relationships, project/goal context, blocking relationships and execution workspaces. citeturn529892search2

Its governance model is particularly useful. Initial strategy and certain actions can require human approval rather than giving agents blanket autonomy. citeturn529892search18

Commandry should borrow that pattern.

It may not even need to recreate Paperclip initially.

A perfectly reasonable architecture is:

**Commandry**
→ creates/maintains contextual work
→ sends execution work to Paperclip
→ receives run/task events
→ displays results inside Commandry

Commandry owns the **personal context and portfolio**.

Paperclip can own much of the **agent workforce execution**.

---

# 27. Nerve and Asterism

Nerve is a good UI reference for the “agent cockpit” portion: agents, workspace files, memory, Kanban work, scheduled jobs, executions and run visibility in one interface. citeturn432114search0turn432114search6

Asterism is another newly relevant reference.

Its model treats each agent as a boundary with its own:

- memory
- secrets
- workspace
- skills
- identity
- autonomy level

and explicitly prevents credentials/context from crossing agent boundaries unless permitted. citeturn944710search6turn944710search11

That is close to how Commandry should model agent security.

Commandry does not need “one JARVIS with the keys to everything.”

A safer implementation is:

**one Commandry**
→ many purpose-specific agents
→ each receiving exactly the context and permissions required.

---

# 28. AI subscription and capacity management

A later feature could model available AI capacity.

For each provider/runtime:

- plan
- usage information where available
- remaining API budget
- preferred tasks
- speed
- capability
- local vs cloud
- interactive availability

Commandry could then help decide:

> This repository analysis is long-running and does not need interaction. Put it into tonight's queue.

or:

> This task requires browser access and should use Agent B.

or:

> These five research tasks can run independently.

The system becomes a scheduler not merely for CPU resources, but for **agent capacity**.

---

# 29. Human approval and autonomy

Every action should have a risk level.

### Read-only
May happen automatically.

Examples:
- fetch metrics
- read repository
- inspect deployment
- check account configuration

### Reversible
May execute under configured autonomy.

Examples:
- create branch
- draft document
- create task
- restart non-critical development container

### Sensitive
Requires explicit permission or policy.

Examples:
- production deployment
- DNS change
- server restart
- account configuration
- credential changes

### Destructive
Normally requires explicit approval.

Examples:
- delete infrastructure
- remove domain
- destroy VM
- wipe data
- delete repository

The agent should submit:

**Proposed action**
**Reason**
**Affected resources**
**Expected result**
**Rollback possibility**

Then Commandry approves/rejects.

---

# 30. Credentials and browser access

The Resend example illustrates why Commandry eventually needs access management.

Suppose several Resend accounts exist because earlier plans permitted fewer domains.

Commandry might contain the knowledge:

> Consolidate these accounts once the current account/domain structure allows it.

Later an agent could inspect each account and propose the consolidation.

However:

**Commandry should not simply store usernames and passwords in ordinary project records.**

Secrets should live in a purpose-built vault.

Infisical is one possible reference. Its machine identities can obtain short-lived access tokens and its dynamic-secrets model supports short-lived, identity-specific credentials rather than exposing permanent secrets everywhere. citeturn596209search0turn596209search11

The conceptual model should be:

**Project**
→ references credential capability

**Agent**
→ requests capability

**Policy**
→ determines permission

**Vault**
→ supplies secret

**Audit trail**
→ records use

For websites that have no useful API, Commandry could later assign isolated browser profiles/sessions to agents.

Those browser sessions should similarly be:

- isolated
- project-scoped
- revocable
- logged
- subject to approval rules

---

# 31. Screenshot-to-task workflow

The Resend scenario also creates an excellent capture workflow.

User takes screenshot.

Share to Commandry.

Commandry recognizes:

- Resend
- account/domain limitation
- possible future account consolidation

It creates:

### Note
Resend now permits more domains per account.

### Task
Investigate consolidating Resend accounts.

### Project relationships
ResuPals  
Project B  
Project C

### Suggested execution
Agent-capable, browser required.

Later Commandry might ask:

> You created this three weeks ago. The affected projects are currently idle. Want me to prepare the consolidation plan?

That is much closer to the “JARVIS” experience than a normal task manager.

---

# 32. Notifications

Notifications should be intelligent enough not to become another source of noise.

Potential priorities:

### Critical
Production service down.

### Action required
Agent waiting for approval.

### Time-sensitive
Deadline approaching.

### Opportunity
Analytics anomaly worth investigating.

### Informational
Scheduled task completed.

### Digest
Low-priority project changes.

Notifications should carry context and actions whenever possible.

Not:

> Server alert.

But:

> Atlas / Coolify  
> Storage has reached 86%, up from 73% seven days ago.  
> Existing task: “Clean old Coolify deployment artifacts.”

**Open task**
**Ask agent to inspect**
**Snooze**

---

# 33. Search and Ask Commandry

Everything should ultimately be queryable.

Examples:

> What projects have I not touched this month?

> Which services are currently unhealthy?

> What work can an agent do tonight without me?

> What was my reasoning for keeping the separate Resend accounts?

> What projects depend on Atlas?

> Which domains expire in the next 60 days?

> What are all of my open Home Assistant ideas?

> What was I planning to do next on ResuPals?

> What scheduled jobs failed this week?

> What agents currently have production access?

This requires both structured querying and semantic retrieval.

---

# 34. Relationships are more important than folders

Commandry should be graph-minded.

A GitHub repository can relate to:

- project
- deployment
- server
- domain
- database
- agent
- task
- documentation

A server can relate to:

- provider
- hypervisor
- VMs
- services
- projects
- alerts
- credentials
- costs

A note can relate to:

- multiple projects
- task
- person
- service
- decision

Folders alone cannot model this.

---

# 35. Reference systems and exactly what to steal

## Plane

Borrow:

- work-item model
- project-focused navigation
- intake/triage
- multiple views
- documentation alongside work
- keyboard-first creation
- MCP/API integration
- reviewable AI actions

Do not simply recreate Plane wholesale. citeturn529892search0turn529892search6

---

## AppFlowy

Borrow:

- one data model represented by many views
- document/database blending
- local/self-hosted mentality
- flexible knowledge organization

Particularly useful for tables, boards and calendar representations. citeturn529892search17turn529892search1

---

## Paperclip

Borrow/integrate:

- agents as workers
- goals
- execution tasks
- heartbeats
- run history
- budgets
- approvals
- task blocking
- agent assignment
- auditability

Paperclip may initially be better as an execution backend than something to rewrite. citeturn529892search4turn529892search19

---

## Nerve

Borrow:

- agent cockpit
- Kanban + agents
- scheduler UX
- run/session visibility
- memory/workspace access
- centralized agent management citeturn432114search0turn432114search6


---

## Asterism

Borrow:

- strict agent boundaries
- separate secrets
- separate memory
- separate workspaces
- explicit autonomy levels
- destructive-action gates citeturn944710search6turn944710search11


---

## Lodestar

Borrow:

- agent-generated dashboard widgets
- natural-language widget creation
- scheduled refresh
- cached results
- MCP-powered widgets citeturn596209search1


---

## Everview

Borrow the overall philosophy:

**External systems remain systems of record. Commandry becomes the system of understanding.** citeturn432114search8


---

## Backstage

Borrow:

- catalog
- resource graph
- domains
- systems
- components
- APIs
- relationships
- plugin architecture

This is probably the most important architectural reference for the infrastructure/project graph. citeturn596209search3turn596209search6

---

## UptimeRobot

Borrow:

- extremely simple monitor creation
- uptime history
- monitor states
- incidents
- HTTP/Ping/Port/API/DNS monitoring
- recovery alerts citeturn596209search2turn596209search4


---

## Beszel

Borrow/integrate:

- small agent
- central hub
- host metrics
- container metrics
- history
- alerts
- API citeturn971528search14


---

## Netdata

Borrow/integrate:

- deep telemetry
- node dashboards
- alerts
- historical metrics
- service metrics
- infrastructure drill-down

Do not rebuild its entire telemetry engine. citeturn596209search12turn596209search13

---

## Homepage

Borrow:

- simple integration cards
- home-lab friendly service widgets
- one dashboard across heterogeneous services
- API-backed Proxmox widgets

It demonstrates how much useful visibility can be provided without recreating the underlying admin interface. citeturn432114search7turn432114search11

---

## CubeCoders AMP

Integrate:

- instances
- status
- resource usage
- players
- uptime
- disk
- memory
- CPU
- instance actions citeturn432114search13turn432114search5


---

## Infra Agent

Preserve and expand:

- status monitoring
- telemetry
- infrastructure visualization
- lightweight collection

It should probably become either:

**Commandry Collector**

or an infrastructure integration underneath Commandry rather than remaining a completely separate conceptual product.

---

# 36. What Commandry should NOT attempt initially

Do not initially build:

- a complete Netdata replacement
- a complete Home Assistant replacement
- a complete Proxmox interface
- a complete AMP replacement
- a complete GitHub replacement
- a full browser automation platform
- another complete coding-agent runtime
- every possible project-management feature

The initial advantage is not depth in one category.

The advantage is **connection between categories**.

---

# 37. Suggested first product boundary

A sensible initial Commandry could consist of six major modules:

### 1. Command Center
Personal dashboard, activity, alerts and next actions.

### 2. Projects
Project overview, tasks, notes, knowledge and resources.

### 3. Capture
Rapid ingestion and AI triage.

### 4. Infrastructure
Resources, hierarchy, health and metrics.

### 5. Automations
Scheduled tasks, recurring routines and watches.

### 6. Agents
Agent registry, assignments, runs and approvals.

Everything else can grow outward from those six.

---

# 38. Suggested initial navigation

**Home**

**Inbox**

**Projects**

**Work**

**Infrastructure**

**Automations**

**Agents**

**Knowledge**

**Activity**

**Search**

Then a persistent global command bar:

`⌘ K`

Examples:

> Create task

> Capture note

> Ask Commandry

> Open Atlas

> Show ResuPals

> Run agent

> Add monitor

> Schedule task

---

# 39. Mobile philosophy

The initial application can absolutely remain web-first.

Responsive web/PWA first.

Expo/native later when native capabilities become useful.

The mobile experience should prioritize:

- capture
- notifications
- approval
- task management
- quick dashboard
- agent status
- infrastructure incidents

Complex infrastructure analysis and configuration can remain desktop-oriented.

---

# 40. Long-term loop

The full Commandry loop becomes:

### Observe
Connect to services and receive events/metrics.

↓

### Understand
Attach those signals to projects, infrastructure, knowledge and history.

↓

### Surface
Show what actually deserves attention.

↓

### Decide
Human or agent determines what should happen.

↓

### Plan
Create structured work with context.

↓

### Execute
Human, automation, or agent performs the work.

↓

### Verify
Check result/acceptance criteria.

↓

### Record
Update project state and knowledge.

↓

### Observe again

That loop is effectively the product.

---

# 41. The long-term JARVIS behavior

At maturity, Commandry should be capable of interactions such as:

> **You:** Anything useful we can get done tonight?

> **Commandry:** I found seven autonomous tasks. Four are coding/research tasks, two are infrastructure audits, and one is a browser-based account cleanup. The account cleanup requires approval because it affects external account configuration. The other six can run unattended. Estimated agent capacity is sufficient to run four concurrently.

Or:

> **Commandry:** Atlas storage has climbed 13 percentage points in seven days. You previously captured a Coolify cleanup task. I inspected the project context and this appears related. I can have the Homelab Agent perform a read-only investigation.

Or:

> **You:** What was I doing with Resend?

> **Commandry:** You created several accounts because the earlier plan restricted the number of domains per account. Resend later increased that limit. You wanted to evaluate consolidating the accounts when convenient. Three active projects currently reference those accounts.

That is the destination.

It is not merely an AI chatbot.

It is an AI-accessible **model of the user's digital world**.

---

# 42. Name

## Recommended: Commandry

**Commandry**

### Product description
Personal control plane for projects, systems, infrastructure and agents.

### Short tagline
**Your personal control plane.**

### Longer tagline
**Projects, knowledge, infrastructure, automations and agents. One command center.**

### Domain targets

Check in this order:

1. `commandry.app`
2. `commandry.dev`
3. `commandry.io`
4. `usecommandry.com`
5. `getcommandry.com`

The exact registrar status should be confirmed directly with Namecheap before purchasing because domain availability changes in real time.

The name is intentionally **not** tied to:

- tasks
- project management
- AI
- servers
- notes
- agents

so the product can continue expanding without outgrowing its identity.

**Commandry is the place where everything comes together.**
