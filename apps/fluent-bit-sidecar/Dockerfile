# Dead simple Fluent Bit sidecar
FROM fluent/fluent-bit:3.2.2

# Copy basic config
COPY fluent-bit.conf /fluent-bit/etc/fluent-bit.conf

# Run Fluent Bit
CMD ["/fluent-bit/bin/fluent-bit", "--config=/fluent-bit/etc/fluent-bit.conf"]