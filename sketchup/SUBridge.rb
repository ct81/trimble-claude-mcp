require 'socket'
require 'json'
require 'time'

module SUBridge
  PORT = 43127
  @queue = Queue.new
  @started = false

  def self.get_status
    model = Sketchup.active_model

    {
      connected: true,
      version: Sketchup.version,
      model_open: !model.nil?,
      model_name: model ? model.title : nil,
      model_path: model ? model.path : nil,
      modified: model ? model.modified? : false,
      entity_count: model ? model.entities.length : 0,
      component_count: model ? model.definitions.length : 0,
      material_count: model ? model.materials.length : 0,
      selected_count: model ? model.selection.length : 0,
      checked_at: Time.now.iso8601
    }
  end

  def self.start
    return if @started

    @started = true

    UI.start_timer(0.1, true) do
      until @queue.empty?
        _client, result = @queue.pop

        begin
          result << get_status
        rescue StandardError => e
          result << { error: e.message }
        end
      end
    end

    Thread.new do
      server = TCPServer.new('127.0.0.1', PORT)
      puts "SketchUp bridge listening on #{PORT}"

      loop do
        client = server.accept

        Thread.new(client) do |socket|
          begin
            request_line = socket.gets
            next unless request_line

            method, request_path = request_line.split(' ', 3)

            while (header = socket.gets)
              break if header == "\r\n" || header == "\n"
            end

            if method == 'GET' && request_path == '/status'
              result = Queue.new
              @queue << [socket, result]
              data = result.pop
              code = data[:error] ? 500 : 200
              phrase = code == 200 ? 'OK' : 'Internal Server Error'
            else
              data = { error: 'Use GET /status' }
              code = 404
              phrase = 'Not Found'
            end

            body = JSON.generate(data)
            socket.write(
              "HTTP/1.1 #{code} #{phrase}\r\n" \
              "Content-Type: application/json\r\n" \
              "Content-Length: #{body.bytesize}\r\n" \
              "Connection: close\r\n\r\n#{body}"
            )
          rescue StandardError => e
            puts "Bridge error: #{e.message}"
          ensure
            socket.close unless socket.closed?
          end
        end
      end
    rescue StandardError => e
      puts "Bridge startup error: #{e.message}"
      @started = false
    end
  end
end

SUBridge.start