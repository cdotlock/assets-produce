package assets

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

type Ref struct {
	Value    string `json:"value"`
	Expected string `json:"expected"`
}

func IsHTTPURL(value string) bool {
	return strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://")
}

func IsOSSURL(value string) bool {
	parsed, err := url.Parse(value)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Host)
	return strings.Contains(host, ".oss-") || strings.HasPrefix(host, "oss-") || strings.Contains(host, "aliyuncs.com")
}

func SidecarFor(path string) string {
	ext := filepath.Ext(path)
	if ext == "" {
		return path + ".url"
	}
	return strings.TrimSuffix(path, ext) + ext + ".url"
}

func ResolveLocalPath(ref string, projectRoot string) string {
	if filepath.IsAbs(ref) {
		return ref
	}
	return filepath.Join(projectRoot, ref)
}

func LocalRefToSidecarURL(ref string, projectRoot string) (urlValue string, sidecar string, err error) {
	localPath := ResolveLocalPath(ref, projectRoot)
	sidecar = SidecarFor(localPath)
	raw, err := os.ReadFile(sidecar)
	if err != nil {
		if os.IsNotExist(err) {
			return "", sidecar, nil
		}
		return "", sidecar, err
	}
	return strings.TrimSpace(string(raw)), sidecar, nil
}

func ResolveAssetURL(ref string, expected string, projectRoot string, allowNonOSS bool) (string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", fmt.Errorf("invalid %s reference: %q", expected, ref)
	}

	resolved := ref
	if !IsHTTPURL(ref) {
		urlValue, sidecar, err := LocalRefToSidecarURL(ref, projectRoot)
		if err != nil {
			return "", err
		}
		if urlValue == "" {
			return "", fmt.Errorf("%s asset is a local path without an OSS sidecar: %s\nUpload it first with scripts/bin/videoctl upload, then rewrite the frontmatter to the OSS URL, or create %s", expected, ref, sidecar)
		}
		resolved = urlValue
	}

	if !IsHTTPURL(resolved) {
		return "", fmt.Errorf("%s sidecar is not an http(s) URL: %s", expected, resolved)
	}
	if !allowNonOSS && !IsOSSURL(resolved) {
		return "", fmt.Errorf("%s URL is not recognized as an OSS URL: %s", expected, resolved)
	}
	return resolved, nil
}

func StringValue(value any) (string, bool) {
	if value == nil {
		return "", false
	}
	switch typed := value.(type) {
	case string:
		trimmed := strings.TrimSpace(typed)
		return trimmed, trimmed != ""
	default:
		raw := strings.TrimSpace(fmt.Sprint(typed))
		return raw, raw != ""
	}
}

func StringSlice(value any) []string {
	if value == nil {
		return nil
	}

	switch typed := value.(type) {
	case []string:
		return compactStrings(typed)
	case []any:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			if text, ok := StringValue(item); ok {
				items = append(items, text)
			}
		}
		return items
	case string:
		if strings.TrimSpace(typed) == "" {
			return nil
		}
		return []string{strings.TrimSpace(typed)}
	default:
		return nil
	}
}

func MapValue(value any) map[string]any {
	if value == nil {
		return nil
	}
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return nil
}

func CollectImageRefs(frontmatter map[string]any) []Ref {
	var refs []Ref
	for _, field := range []string{"first_frame", "last_frame"} {
		if value, ok := StringValue(frontmatter[field]); ok {
			refs = append(refs, Ref{Value: value, Expected: "image"})
		}
	}

	assetMap := MapValue(frontmatter["assets"])
	for _, value := range StringSlice(assetMap["images"]) {
		refs = append(refs, Ref{Value: value, Expected: "image"})
	}

	if value, ok := StringValue(frontmatter["previous_frame_url"]); ok {
		refs = append(refs, Ref{Value: value, Expected: "image"})
	}

	return refs
}

func CollectVideoRefs(frontmatter map[string]any) []Ref {
	var refs []Ref
	assetMap := MapValue(frontmatter["assets"])
	for _, value := range StringSlice(assetMap["videos"]) {
		refs = append(refs, Ref{Value: value, Expected: "video"})
	}
	if value, ok := StringValue(frontmatter["previous_video_url"]); ok {
		refs = append(refs, Ref{Value: value, Expected: "video"})
	}
	return refs
}

func CollectValidationRefs(frontmatter map[string]any) []Ref {
	refs := append([]Ref{}, CollectImageRefs(frontmatter)...)
	refs = append(refs, CollectVideoRefs(frontmatter)...)
	return uniqueRefs(refs)
}

func compactStrings(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func uniqueRefs(refs []Ref) []Ref {
	seen := map[Ref]bool{}
	out := make([]Ref, 0, len(refs))
	for _, ref := range refs {
		if seen[ref] {
			continue
		}
		seen[ref] = true
		out = append(out, ref)
	}
	return out
}
