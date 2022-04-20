package gasprices

import (
	"testing"
)

type MockEpoch struct {
	numBlocks   uint64
	repeatCount uint64
	postHook    func(prevGasPrice uint64, gasPriceUpdater *GasPriceUpdater)
}

func TestGetAverageGasPerSecond(t *testing.T) {
	// Let's sanity check this function with some simple inputs.
	// A 10 block epoch
	epochStartBlockNumber := 10
	latestBlockNumber := 20
	// That lasts 10 seconds (1 block per second)
	epochLengthSeconds := 10
	// And each block has a gas limit of 1
	averageBlockGasLimit := 1
	// We expect a gas per second to be 1!
	expectedGps := 1.0
	gps := GetAverageGasPerSecond(uint64(epochStartBlockNumber), uint64(latestBlockNumber), uint64(epochLengthSeconds), uint64(averageBlockGasLimit))
	if gps != expectedGps {
		t.Fatalf("Gas per second not calculated correctly. Got: %v expected: %v", gps, expectedGps)
	}
}

// Return a gas pricer that targets 3 blocks per epoch & 10% max change per epoch.
func makeTestGasPricerAndUpdater(curPrice uint64) (*GasPricer, *GasPriceUpdater, func(uint64), error) {
	gpsTarget := 3300000.0
	getGasTarget := func() float64 { return gpsTarget }
	epochLengthSeconds := uint64(10)
	averageBlockGasLimit := 11000000.0
	// Based on our 10 second epoch, we are targetting 3 blocks per epoch.
	gasPricer, err := NewGasPricer(curPrice, 1, getGasTarget, 10)
	if err != nil {
		return nil, nil, nil, err
	}

	curBlock := uint64(10)
	incrementCurrentBlock := func(newBlockNum uint64) { curBlock += newBlockNum }
	getLatestBlockNumber := func() (uint64, error) { return curBlock, nil }
	updateL2GasPrice := func(x uint64) error {
		return nil
	}

	startBlock, _ := getLatestBlockNumber()
	gasUpdater, err := NewGasPriceUpdater(
		gasPricer,
		startBlock,
		averageBlockGasLimit,
		epochLengthSeconds,
		getLatestBlockNumber,
		updateL2GasPrice,
	)
	if err != nil {
		return nil, nil, nil, err
	}
	return gasPricer, gasUpdater, incrementCurrentBlock, nil
}

func TestUpdateGasPriceCallsUpdateL2GasPriceFn(t *testing.T) {
	_, gasUpdater, incrementCurrentBlock, err := makeTestGasPricerAndUpdater(1)
	if err != nil {
		t.Fatal(err)
	}
	wasCalled := false
	gasUpdater.updateL2GasPriceFn = func(gasPrice uint64) error {
		wasCalled = true
		return nil
	}
	incrementCurrentBlock(3)
	if err := gasUpdater.UpdateGasPrice(); err != nil {
		t.Fatal(err)
	}
	if wasCalled != true {
		t.Fatalf("Expected updateL2GasPrice to be called.")
	}
}

func TestUpdateGasPriceCorrectlyUpdatesAZeroBlockEpoch(t *testing.T) {
	gasPricer, gasUpdater, _, err := makeTestGasPricerAndUpdater(100)
	if err != nil {
		t.Fatal(err)
	}
	gasPriceBefore := gasPricer.curPrice
	gasPriceAfter := gasPricer.curPrice
	gasUpdater.updateL2GasPriceFn = func(gasPrice uint64) error {
		gasPriceAfter = gasPrice
		return nil
	}
	if err := gasUpdater.UpdateGasPrice(); err != nil {
		t.Fatal(err)
	}
	if gasPriceBefore < gasPriceAfter {
		t.Fatalf("Expected gasPrice to go down because we had fewer than 3 blocks in the epoch.")
	}
}

func TestUpdateGasPriceFailsIfBlockNumberGoesBackwards(t *testing.T) {
	_, gasUpdater, _, err := makeTestGasPricerAndUpdater(1)
	if err != nil {
		t.Fatal(err)
	}
	gasUpdater.epochStartBlockNumber = 10
	gasUpdater.getLatestBlockNumberFn = func() (uint64, error) { return 0, nil }
	err = gasUpdater.UpdateGasPrice()
	if err == nil {
		t.Fatalf("Expected UpdateGasPrice to fail when block number goes backwards.")
	}
}

func TestUsageOfGasPriceUpdater(t *testing.T) {
	_, gasUpdater, incrementCurrentBlock, err := makeTestGasPricerAndUpdater(1000)
	if err != nil {
		t.Fatal(err)
	}
	// In these mock epochs the gas price shold go up and then down again after the time has passed
	mockEpochs := []MockEpoch{
		// First jack up the price to show that it will grow over time
		MockEpoch{
			numBlocks:   10,
			repeatCount: 3,
			// Make sure the gas price is increasing
			postHook: func(prevGasPrice uint64, gasPriceUpdater *GasPriceUpdater) {
				curPrice := gasPriceUpdater.gasPricer.curPrice
				if prevGasPrice >= curPrice {
					t.Fatalf("Expected gas price to increase.")
				}
			},
		},
		// Then stabilize around the GPS we want
		MockEpoch{
			numBlocks:   3,
			repeatCount: 5,
			postHook:    func(prevGasPrice uint64, gasPriceUpdater *GasPriceUpdater) {},
		},
		MockEpoch{
			numBlocks:   3,
			repeatCount: 0,
			postHook: func(prevGasPrice uint64, gasPriceUpdater *GasPriceUpdater) {
				curPrice := gasPriceUpdater.gasPricer.curPrice
				if prevGasPrice != curPrice {
					t.Fatalf("Expected gas price to stablize.")
				}
			},
		},
		// Then reduce the demand to show the fee goes back down to the floor
		MockEpoch{
			numBlocks:   1,
			repeatCount: 5,
			postHook: func(prevGasPrice uint64, gasPriceUpdater *GasPriceUpdater) {
				curPrice := gasPriceUpdater.gasPricer.curPrice
				if prevGasPrice <= curPrice && curPrice != gasPriceUpdater.gasPricer.floorPrice {
					t.Fatalf("Expected gas price either reduce or be at the floor.")
				}
			},
		},
	}
	loop := func(epoch MockEpoch) {
		prevGasPrice := gasUpdater.gasPricer.curPrice
		incrementCurrentBlock(epoch.numBlocks)
		err = gasUpdater.UpdateGasPrice()
		if err != nil {
			t.Fatal(err)
		}
		epoch.postHook(prevGasPrice, gasUpdater)
	}
	for _, epoch := range mockEpochs {
		for i := 0; i < int(epoch.repeatCount)+1; i++ {
			loop(epoch)
		}
	}
}
