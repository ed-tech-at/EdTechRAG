package main

// GitLab2EdTechRAG_ENDPOINT="http://localhost:8080" go run main.go

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

type apiResponse struct {
	Success *bool  `json:"success"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

func git(args ...string) string {
	out, _ := exec.Command("git", args...).Output()
	return strings.TrimSpace(string(out))
}

func gitRaw(args ...string) string {
	out, _ := exec.Command("git", args...).Output()
	return string(out)
}

func hmacHex(key string, msg []byte) string {
	m := hmac.New(sha256.New, []byte(key))
	m.Write(msg)
	return hex.EncodeToString(m.Sum(nil))
}

func joinEndpoint(base string, endpointPath string) string {
	if base == "" {
		return endpointPath
	}
	parsed := strings.TrimRight(base, "/")
	return parsed + "/" + strings.TrimLeft(endpointPath, "/")
}

func signedPost(client *http.Client, endpoint string, secret string, payload map[string]any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload for %s: %w", endpoint, err)
	}

	sig := hmacHex(secret, body)

	_, _ = os.Stdout.WriteString("POST " + endpoint + "\n")
	_, _ = os.Stdout.WriteString("Signature: sha256=" + sig + "\n")
	_, _ = os.Stdout.WriteString("Payload:\n" + string(body) + "\n")

	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request for %s: %w", endpoint, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", "sha256="+sig)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed for %s: %w", endpoint, err)
	}
	defer resp.Body.Close()

	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return fmt.Errorf("read response for %s: %w", endpoint, readErr)
	}

	_, _ = os.Stdout.WriteString("Response: " + resp.Status + "\n")
	if len(respBody) > 0 {
		_, _ = os.Stdout.WriteString(string(respBody) + "\n")
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status for %s: %s", endpoint, resp.Status)
	}

	var apiResp apiResponse
	if err := json.Unmarshal(respBody, &apiResp); err == nil {
		if apiResp.Success != nil && !*apiResp.Success {
			if apiResp.Message != "" {
				return fmt.Errorf("endpoint %s reported failure (%s): %s", endpoint, apiResp.Status, apiResp.Message)
			}
			return fmt.Errorf("endpoint %s reported failure (%s)", endpoint, apiResp.Status)
		}

		if apiResp.Status == "partial" {
			if apiResp.Message != "" {
				return fmt.Errorf("endpoint %s returned partial result: %s", endpoint, apiResp.Message)
			}
			return fmt.Errorf("endpoint %s returned partial result", endpoint)
		}
	}

	return nil
}

func main() {
	_, _ = os.Stdout.WriteString("GitLab2EdTechRAG started: " + time.Now().Format(time.RFC3339Nano) + "\n")

	secret := os.Getenv("GitLab2EdTechRAG_SHARED_SECRET")
	baseEndpoint := os.Getenv("GitLab2EdTechRAG_ENDPOINT")

	_, _ = os.Stdout.WriteString("GitLab2EdTechRAG_ENDPOINT: " + baseEndpoint + "\n")

	head := os.Getenv("CI_COMMIT_SHA")
	base := os.Getenv("CI_COMMIT_BEFORE_SHA")
	repo := os.Getenv("CI_PROJECT_PATH")
	src := os.Getenv("CI_PIPELINE_SOURCE")

	if secret == "" {
		_, _ = os.Stderr.WriteString("GitLab2EdTechRAG_SHARED_SECRET is missing\n")
		os.Exit(1)
	}
	if baseEndpoint == "" {
		_, _ = os.Stderr.WriteString("GitLab2EdTechRAG_ENDPOINT is missing\n")
		os.Exit(1)
	}
	if repo == "" {
		_, _ = os.Stderr.WriteString("CI_PROJECT_PATH is missing\n")
		os.Exit(1)
	}

	if base == "" || strings.HasPrefix(base, "0000") {
		base = git("hash-object", "-t", "tree", "/dev/null")
	}

	_ = exec.Command("git", "fetch", "origin", base, head).Run()
	diff := gitRaw("diff", "--name-status", "-z", "-M", base, head)

	payload := map[string]any{
		"repository_path": repo,
		"pipeline_source": src,
		"base_sha":        base,
		"head_sha":        head,
		"timestamp":       time.Now().Unix(),
		"changes": map[string]any{
			"raw": diff,
		},
	}

	client := &http.Client{Timeout: 10 * time.Minute}
	steps := []struct {
		Name     string
		Endpoint string
	}{
		{Name: "pull", Endpoint: joinEndpoint(baseEndpoint, "/pull")},
		{Name: "chunk", Endpoint: joinEndpoint(baseEndpoint, "/chunk")},
		{Name: "embed", Endpoint: joinEndpoint(baseEndpoint, "/embed")},
	}

	for _, step := range steps {
		_, _ = os.Stdout.WriteString("Starting " + step.Name + " request\n")
		if err := signedPost(client, step.Endpoint, secret, payload); err != nil {
			_, _ = os.Stderr.WriteString("Step failed: " + step.Name + ": " + err.Error() + "\n")
			os.Exit(1)
		}
	}

	_, _ = os.Stdout.WriteString("File transfer to EdTechRAG and chunking complete\n")
	_, _ = os.Stdout.WriteString("Embedding complete\n")
}
