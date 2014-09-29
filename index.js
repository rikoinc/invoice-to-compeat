var fs          = require('fs');
var Baby        = require('babyparse');
var moment      = require('moment');
var numeral     = require('numeral');
var nodemailer  = require('nodemailer');

var credentials = require(__dirname + '/credentials.json');

var item_code_regex = /([A-Z]+)/;


var email_transport = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: credentials.gmail.user,
    pass: credentials.gmail.pass
  }
});


var outputFile = function(num, data, callback) {
  var output_str = Baby.unparse(data, { header: true });

  fs.writeFile(__dirname + '/output/' + num + '.riko.csv', output_str, function(err) {
    if (err) throw err;

    callback(num);
  });

  email_transport.sendMail({
    from:     credentials.gmail.from,
    to:       credentials.gmail.to,
    subject:  ('Invoice ' + num),
    text:     '',
    attachments: [
      {
        filename: (num + '.' + credentials.company + '.csv'),
        content: output_str
      }
    ]
  }, function(err, info) {
    if (err) throw err;

    console.log('Email for invoice ' + num + ' sent:', info.response);
  });
};


fs.readFile(__dirname + '/data/data.csv', function(err, buffer) {
  if (err) throw err;

  var obj = Baby.parse(buffer.toString(), {
    header: true,
    dynamicTyping: true
  });

  var data        = obj.data;
  var first_row   = data[2];  // Actual lines start on row 2
  var current_inv = first_row['Num'];

  var hiya = {};

  hiya[current_inv.toString()] = {
    raw:        [],
    formatted:  []
  };

  for (var i = 1; i < (data.length - 2); ++i) {
    var this_num = data[i]['Num'];

    if (current_inv === this_num) {
      hiya[current_inv.toString()]['raw'].push(data[i]);
    } else {
      current_inv = data[i]['Num'];

      var str = current_inv.toString();

      hiya[str] = {
        raw:        [],
        formatted:  []
      };

      hiya[str]['raw'].push(data[i]);
    }
  }

  var result          = [];
  var running_balance = 0;

  var date    = first_row['Date'];
  var a_num   = first_row['Num'];
  var a_acc   = first_row['Name Account #'];

  for (var invoice in hiya) {
    var this_invoice    = hiya[invoice];
    var running_balance = 0;

    // Loop through the raw data, re-formatting and pushing into the invoice object's `formatted`
    // array
    for (var i = 0; i < this_invoice.raw.length; ++i) {
      var this_line = this_invoice.raw[i];

      var tax = 0;
      var sub = this_line['Amount'] * 100;  // Mult by 100 to avoid FP errors

      if (this_line['Sales Tax Code'] === 'Taxable Sales') {
        // If this is a taxable item, we need to multiple the extension by the tax rate -- 0.0975 --
        // and then add the tax to the extension before adding it to the invoice's running
        // balance
        tax = sub * credentials.tax;

        running_balance += (sub + tax);

        tax = (tax / 100);
      } else {
        running_balance += sub;
      }

      this_invoice.formatted[i] = {
        // 'Compeat Vendor Code': 'Riko',   // Doesn't matter
        InvoiceDate:      date,
        InvoiceNumber:    invoice,
        //acc:            a_acc,
        ItemDescription:  this_line['Item Description'],
        ItemNumber:       this_line['Item'].match(item_code_regex)[0],
        QTY:              this_line['Qty'],
        UnitPrice:        numeral(this_line['Sales Price']).format('0.00'),
        ExtPrice:         numeral(sub / 100).format('0.00'),
        'Doc Amt':        0,
        Tax:              tax
      };
    }

    var invoice_total = numeral(running_balance / 100).format('0.00');

    for (var j = 0; j < this_invoice.formatted.length; ++j) {
      this_invoice.formatted[j]['Doc Amt'] = invoice_total;
    }

    outputFile(invoice, hiya[invoice].formatted, function(num) { console.log('Wrote', num); });
  }

  /*
  // For debug purposes
  fs.writeFile(__dirname + '/output/out.json', JSON.stringify(hiya, null, 2), function(err) {
    if (err) throw err;
  });
  */
});
