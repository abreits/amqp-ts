/**
 * Create the taplanding table in oracle, removes any existing taplanding table first
 * Created by Ab on 9-7-2015.
 */

var oracledb = require('oracledb');

console.log("trying to connect to Oracle");
oracledb.getConnection(
  {
    user          : "hr",
    password      : "hr",
    connectString : "172.16.128.23:1521/ORCL"
  },
  function(err, connection)
  {
    if (err) {
      console.error(err.message);
      return;
    }
    console.log("Connected, trying to create TAPLANDING table");
    connection.execute(
      "drop table taplanding",
      function(err) {
        if (err) {
          console.error(err.message);
          return;
        }
        console.log("Existing table removed");
        connection.execute(
          "create table taplanding (" +
          "product_id integer, " +
          "product_type varchar2(32), " +
          "target_code varchar2(32), " +
          "case_code varchar2(32), " +
          "caller integer, " +
          "called integer, " +
          "event_time date, " +
          "coordinate_x number(12,9), " +
          "coordinate_y number(12,9)" +
          ")",
          function (err) {
            if (err) {
              console.error(err.message);
              return;
            }
            console.log("Table created");

            connection.release(
              function (err) {
                if (err) {
                  console.error(err.message);
                  return;
                }
              });
          });
      });
  });
