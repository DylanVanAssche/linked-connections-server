#!/usr/bin/python3

import requests
import sys
import csv
import argparse
from statistics import mean, median, stdev, variance

SEPARATOR_LENGTH = 100
ROUNDING = 3

def generateHeader(title):
    print("-" * SEPARATOR_LENGTH)
    print(" " * (round((SEPARATOR_LENGTH - len(str(title)))/2))  + str(title) \
    + " " * (round((SEPARATOR_LENGTH - len(str(title)))/2)))
    print("-" * SEPARATOR_LENGTH)

# Benchmark
def runBenchmark(numberOfRequests, url):
    generateHeader("RUNNING BENCHMARK")
    requestCounter = 0
    results = []

    while(requestCounter < numberOfRequests):
        r = requests.get(url)
        results.append({
            "url": r.url,
            "status": r.status_code,
            "responseTime": round(r.elapsed.total_seconds()*1000, ROUNDING),
            "response" : r.json()
            })
        requestCounter = requestCounter + 1
        sys.stdout.write("\r{0}/{1} requests completed".format(requestCounter, numberOfRequests))
        sys.stdout.flush()
    print("\nDone! Preparing your results...")
    return results

# Indivudual results generation (verbose)
def generateIndividualResults(results):
    generateHeader("INDIVIDUAL RESULTS")
    for r in results:
        print(r["url"])
        print("\tHTTP status code: {0}".format(r["status"]))
        print("\tResponse time: {0} ms".format(r["responseTime"]))

# Report generation
def generateReport(results, numberOfRequests):
    generateHeader("REPORT")
    resultsResponseTime = []
    for r in results:
        resultsResponseTime.append(r["responseTime"])

    resultsFailed = []
    for r in results:
        if r["status"] >= 400:
            resultsFailed.append(r)

    print("NUMBER OF REQUESTS:")
    print("\tTotal: {0}".format(numberOfRequests))
    print("\tSuccess: {0}".format(numberOfRequests - len(resultsFailed)))
    print("\tFailed: {0}".format(len(resultsFailed)))
    for fail in resultsFailed:
        print("\t\tURL: {0}".format(fail["url"]))
    print("\nRESPONSE TIME:")
    print("\tMinimum: {0} ms".format(round(min(resultsResponseTime), ROUNDING)))
    print("\tMaximum: {0} ms".format(round(max(resultsResponseTime), ROUNDING)))
    print("\tAverage: {0} ms".format(round(mean(resultsResponseTime), ROUNDING)))
    print("\tMedian: {0} ms".format(round(median(resultsResponseTime), ROUNDING)))
    print("\tStandard deviation: {0} ms".format(round(stdev(resultsResponseTime), ROUNDING)))
    print("\tVariance: {0} ms".format(round(variance(resultsResponseTime), ROUNDING)))

# CSV exporting
def generateCSV(data, fileName):
    generateHeader("EXPORTING RESULTS AS CSV")
    with open(fileName, "w") as file:
        fields = ["url", "status", "response_time"]
        writer = csv.DictWriter(file, fields)
        writer.writeheader()
        for i in range(len(data)):
            d = data[i]
            writer.writerow({"url": d["url"], "status": d["status"], "response_time": d["responseTime"]})
            sys.stdout.write("\r{0}/{1} exporting results".format(i+1, len(data)))
            sys.stdout.flush()
    print("\nResults exported as CSV")

def main():
    parser = argparse.ArgumentParser(description="Benchmarking HTTP servers using Python Requests by Dylan Van Assche (2018)")
    parser.add_argument("url", type=str, help="The URL to benchmark.")
    parser.add_argument("-n", "--numberOfRequests", type=int, help="The number of requests for the benchmark.", default=20)
    parser.add_argument("-i", "--individual", help="Print individual results to the console.", action="store_true", default=False)
    parser.add_argument("-o", "--output", type=str, help="Export results to a given file in CSV format.")
    args = parser.parse_args()
    showIndividualResults = args.individual
    exportAsCSV = len(args.output) > 0
    csvFileName = args.output
    numberOfRequests = args.numberOfRequests
    url = args.url
    generateHeader("OPTIONS")
    print("Showing individual results: {0}".format(showIndividualResults))
    print("Exporting results as CSV: {0}".format(exportAsCSV))
    print("Number of requests: {0}".format(numberOfRequests))

    # Run benchmark
    results = runBenchmark(numberOfRequests, url)

    # Print individual results if required
    if showIndividualResults:
        generateIndividualResults(results)

    # Export results as CSV if required
    if exportAsCSV:
        generateCSV(results, csvFileName)

    # Generate report
    generateReport(results, numberOfRequests)

main()
