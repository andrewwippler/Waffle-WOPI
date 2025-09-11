#!/bin/bash
podman build -t d.wplr.rocks/collabora-middleware:$1 -t d.wplr.rocks/collabora-middleware:latest .
podman push d.wplr.rocks/collabora-middleware:$1
podman push d.wplr.rocks/collabora-middleware:latest
kubectl --namespace collabora set image deployment/collabora-middleware middleware=d.wplr.rocks/collabora-middleware:$1

podman rmi d.wplr.rocks/collabora-middleware:$1