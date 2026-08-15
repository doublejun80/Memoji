# Windows VDI QA Checklist

## Environment
- [ ] OS Build
- [ ] WebView2 Version
- [ ] vCPU
- [ ] Physical/Core Mapping
- [ ] RAM
- [ ] Profile Type
- [ ] Data Path
- [ ] Model Path
- [ ] EDR Version
- [ ] Display Scale

## Storage
- [ ] Writable Probe
- [ ] Persistent Data Root
- [ ] Network Drive DB
- [ ] Local Runtime Cache
- [ ] Backup
- [ ] Restore
- [ ] Session Cleanup
- [ ] Disk Full

## App
- [ ] Fresh Start
- [ ] Existing DB
- [ ] 800×600
- [ ] Korean IME
- [ ] Long Markdown
- [ ] Table
- [ ] Export
- [ ] Import
- [ ] Close Flush
- [ ] Session Reconnect

## AI Runtime
- [ ] Bundle Hash
- [ ] Model Hash
- [ ] Runtime Start
- [ ] Runtime Stop
- [ ] Model List
- [ ] Test Generation
- [ ] Korean Stream
- [ ] Cancellation
- [ ] Crash Recovery
- [ ] Port Conflict
- [ ] Auth/Process Identity
- [ ] Model Missing
- [ ] Cache Creation
- [ ] EDR Allow/Block
- [ ] CPU Feature Detection
- [ ] AVX2 Build
- [ ] AVX-512 Build if applicable

## Benchmark
- [ ] E2B Cold
- [ ] E2B Warm
- [ ] E4B Optional
- [ ] Prompt 256
- [ ] Prompt 1024
- [ ] Prompt 4096
- [ ] Output 64
- [ ] Output 256
- [ ] TTFT
- [ ] Prefill TPS
- [ ] Decode TPS
- [ ] Peak RSS
- [ ] Page Fault
- [ ] p50
- [ ] p95
- [ ] MTP Acceptance if verified

## Security
- [ ] No outbound traffic
- [ ] Loopback binding
- [ ] Redirect disabled
- [ ] Secret redaction
- [ ] Prompt absent from normal logs
- [ ] Signed executable
- [ ] SBOM/NOTICE
