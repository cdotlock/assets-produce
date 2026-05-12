package download

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/cdotlock/assets-produce/videoctl/internal/assets"
)

type Options struct {
	Timeout    time.Duration
	NoSidecar  bool
	HTTPClient *http.Client
}

func Download(ctx context.Context, urlValue string, output string, opts Options) (string, string, error) {
	if !assets.IsHTTPURL(urlValue) {
		return "", "", fmt.Errorf("video URL is not http(s): %s", urlValue)
	}
	outPath, err := filepath.Abs(output)
	if err != nil {
		return "", "", err
	}
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return "", "", err
	}

	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = 600 * time.Second
	}
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, urlValue, nil)
	if err != nil {
		return "", "", err
	}
	client := opts.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: timeout}
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	tmp := outPath + ".tmp"
	file, err := os.Create(tmp)
	if err != nil {
		return "", "", err
	}
	if _, err := io.Copy(file, resp.Body); err != nil {
		file.Close()
		return "", "", err
	}
	if err := file.Close(); err != nil {
		return "", "", err
	}
	if err := os.Rename(tmp, outPath); err != nil {
		return "", "", err
	}

	sidecar := ""
	if !opts.NoSidecar {
		sidecar = assets.SidecarFor(outPath)
		if err := os.WriteFile(sidecar, []byte(urlValue+"\n"), 0o644); err != nil {
			return "", "", err
		}
	}
	return outPath, sidecar, nil
}

func ReadURLFile(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(bytesTrimSpace(raw)), nil
}

func bytesTrimSpace(raw []byte) []byte {
	for len(raw) > 0 && (raw[0] == ' ' || raw[0] == '\n' || raw[0] == '\r' || raw[0] == '\t') {
		raw = raw[1:]
	}
	for len(raw) > 0 {
		last := raw[len(raw)-1]
		if last != ' ' && last != '\n' && last != '\r' && last != '\t' {
			break
		}
		raw = raw[:len(raw)-1]
	}
	return raw
}
