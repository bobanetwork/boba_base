package proxyd

import (
	"errors"
	"fmt"
	"github.com/ethereum/go-ethereum/log"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func Start(config *Config) error {
	if len(config.Backends) == 0 {
		return errors.New("must define at least one backend")
	}
	if len(config.BackendGroups) == 0 {
		return errors.New("must define at least one backend group")
	}
	if len(config.RPCMethodMappings) == 0 {
		return errors.New("must define at least one RPC method mapping")
	}

	for authKey := range config.Authentication {
		if authKey == "none" {
			return errors.New("cannot use none as an auth key")
		}
	}

	redis, err := NewRedis(config.Redis.URL)
	if err != nil {
		return err
	}

	backendNames := make([]string, 0)
	backendsByName := make(map[string]*Backend)
	for name, cfg := range config.Backends {
		opts := make([]BackendOpt, 0)

		if cfg.RPCURL == "" {
			return fmt.Errorf("must define an RPC URL for backend %s", name)
		}
		if cfg.WSURL == "" {
			return fmt.Errorf("must define a WS URL for backend %s", name)
		}

		if config.BackendOptions.ResponseTimeoutSeconds != 0 {
			timeout := secondsToDuration(config.BackendOptions.ResponseTimeoutSeconds)
			opts = append(opts, WithTimeout(timeout))
		}
		if config.BackendOptions.MaxRetries != 0 {
			opts = append(opts, WithMaxRetries(config.BackendOptions.MaxRetries))
		}
		if config.BackendOptions.MaxResponseSizeBytes != 0 {
			opts = append(opts, WithMaxResponseSize(config.BackendOptions.MaxResponseSizeBytes))
		}
		if config.BackendOptions.OutOfServiceSeconds != 0 {
			opts = append(opts, WithOutOfServiceDuration(secondsToDuration(config.BackendOptions.OutOfServiceSeconds)))
		}
		if cfg.MaxRPS != 0 {
			opts = append(opts, WithMaxRPS(cfg.MaxRPS))
		}
		if cfg.MaxWSConns != 0 {
			opts = append(opts, WithMaxWSConns(cfg.MaxWSConns))
		}
		if cfg.Password != "" {
			opts = append(opts, WithBasicAuth(cfg.Username, cfg.Password))
		}
		back := NewBackend(name, cfg.RPCURL, cfg.WSURL, redis, opts...)
		backendNames = append(backendNames, name)
		backendsByName[name] = back
		log.Info("configured backend", "name", name, "rpc_url", cfg.RPCURL, "ws_url", cfg.WSURL)
	}

	backendGroups := make(map[string]*BackendGroup)
	for bgName, bg := range config.BackendGroups {
		backends := make([]*Backend, 0)
		for _, bName := range bg.Backends {
			if backendsByName[bName] == nil {
				return fmt.Errorf("backend %s is not defined", bName)
			}
			backends = append(backends, backendsByName[bName])
		}
		group := &BackendGroup{
			Name:     bgName,
			Backends: backends,
		}
		backendGroups[bgName] = group
	}

  var wsBackendGroup *BackendGroup
  if config.WSBackendGroup != "" {
    wsBackendGroup = backendGroups[config.WSBackendGroup]
    if wsBackendGroup == nil {
      return fmt.Errorf("ws backend group %s does not exist", config.WSBackendGroup)
    }
  }

  if wsBackendGroup == nil && config.Server.WSPort != 0 {
    return fmt.Errorf("a ws port was defined, but no ws group was defined")
  }

	for _, bg := range config.RPCMethodMappings {
		if backendGroups[bg] == nil {
			return fmt.Errorf("undefined backend group %s", bg)
		}
	}

	srv := NewServer(
		backendGroups,
		wsBackendGroup,
		NewStringSetFromStrings(config.WSMethodWhitelist),
		config.RPCMethodMappings,
		config.Server.MaxBodySizeBytes,
		config.Authentication,
	)

	if config.Metrics.Enabled {
		addr := fmt.Sprintf("%s:%d", config.Metrics.Host, config.Metrics.Port)
		log.Info("starting metrics server", "addr", addr)
		go http.ListenAndServe(addr, promhttp.Handler())
	}

	if config.Server.RPCPort != 0 {
		go func() {
			if err := srv.RPCListenAndServe(config.Server.RPCHost, config.Server.RPCPort); err != nil {
				if errors.Is(err, http.ErrServerClosed) {
					log.Info("RPC server shut down")
					return
				}
				log.Crit("error starting RPC server", "err", err)
			}
		}()
	}

	if config.Server.WSPort != 0 {
		go func() {
			if err := srv.WSListenAndServe(config.Server.WSHost, config.Server.WSPort); err != nil {
				if errors.Is(err, http.ErrServerClosed) {
					log.Info("WS server shut down")
					return
				}
				log.Crit("error starting WS server", "err", err)
			}
		}()
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	recvSig := <-sig
	log.Info("caught signal, shutting down", "signal", recvSig)
	srv.Shutdown()
	if err := redis.FlushBackendWSConns(backendNames); err != nil {
		log.Error("error flushing backend ws conns", "err", err)
	}
	return nil
}

func secondsToDuration(seconds int) time.Duration {
	return time.Duration(seconds) * time.Second
}
