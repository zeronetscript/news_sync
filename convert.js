"use strict"
var fs = require("fs")
var jsonfile = require("jsonfile")
var request = require('request')
var jsdom = require('jsdom');
var path = require('path');
var FeedParser = require('feedparser');


var WaitGroup=require('waitgroup');

var wg=new WaitGroup;


var jqueryPath=path.join(__dirname,"jquery.js");

if (fs.accessSync(jqueryPath)) {
    
    console.log(jqueryPath+" not exits,exit");
    return;
}

var jquery = fs.readFileSync(jqueryPath,"utf-8");

var old_data = jsonfile.readFileSync("data.json");

if (!old_data.tag) {
  old_data.tag=[]
}

var next_post_id = old_data.next_post_id;

var changed = false;

function alreadyHave(title){

    for (var i in old_data.post){
        if(old_data.post[i].title==title){
            return true;
        }
    }

    return false;

}

function collectContent($,jqueryCssSelector){

    var contents=$(jqueryCssSelector);

    if (contents.length==0) {
        
        return "";
    }
        
    var res="";
    for (var i in contents){
        var pText = contents[i].outerHTML;
        if (pText!=undefined) {
            res=res+'\n'+pText;
        }
    }

    return res;

}


function genFunc(jqueryCssSelector){
    return function($){
        return collectContent($,jqueryCssSelector);
    }
}

var feed_func = [

    {
        name:'RFI',
        url:"http://cn.rfi.fr/general/rss",
        extract_func:genFunc("div[itemprop='articleBody']  > p ")
    },
    {
        name:'VOA',
        url:"http://www.voachinese.com/api/epiqq",
        extract_func:genFunc("#article  div.articleContent div.zoomMe > p")
    },
    {
        name:'DW',
        url:"http://rss.dw.com/rdf/rss-chi-all",
        extract_func:genFunc("#bodyContent div.group > div.longText > p ")
    },
    {
        name:'RFA',
        url:'http://www.rfa.org/mandarin/RSS',
        extract_func:genFunc("#storytext p")
    },
    {
        name:'BBC',
        url:'http://www.bbc.com/zhongwen/simp/index.xml',
        extract_func:genFunc("#page div[role='main'] div.story-body p")
    },
    {
        name:'NYTIMES',
        url:'http://cn.nytimes.com/rss.html',
        extract_func:genFunc("article.article_content div.content_list > p")
    }
];

function add_article(name,article,extract_func){

    wg.add();

    jsdom.env({
        url:encodeURI(article.link),
        src:[jquery],
        done:function(err,window){
            if (err) {
                window.close();
                wg.done();
                return;
            }

            var $ = window.$;



            var body = extract_func($);

            if (body=="") {
                window.close();
                wg.done();
                return;
            }

            console.log("adding "+name+":"+article.title);

            var post = {
                'post_id': old_data.next_post_id,
                'title':name+" "+article.title,
                'date_published': (new Date(article.pubdate)).getTime()/1000,
                'body':"---\n"+body
            };

            var dedup=[name];

            for(var i in article.categories){
              var spaceSplited= article.categories[i].split(" ");
              if (spaceSplited=="") {
                //exclude empty
                continue;
              }

              //repace multi spaces to one slash
              var spaceAsSlash=spaceSplited[0];
              var left = spaceSplited.slice(1);
              for (var j in left){
                spaceAsSlash += "/"+left[j];
              }

              if (dedup.indexOf(spaceAsSlash)==-1) {
                dedup.push(spaceAsSlash);
              }
            }

            for(var i in dedup){
              old_data.tag.push({
                value:dedup[i],
                post_id:post.post_id
              });
            }

            old_data.post.unshift(post);
            old_data.next_post_id = old_data.next_post_id+1;
            changed=true;
            wg.done();
            window.close();
        }
    });
    
}
    

function nextFeed(index){


    var feedparser = new FeedParser();

    if (index>=feed_func.length) {
        return;
    }

    var thisOne=feed_func[index];

    var name=thisOne.name;
    console.log("collect:"+name);
    wg.add();

    var req = request (thisOne.url);

    feedparser.on('error',function(err){
        nextFeed(index+1);
	    console.log("error done:"+err);
	    wg.done();
    });


    feedparser.on('readable', function(){

        var stream=this;

        var article;

        while(article=stream.read()){
            var title = thisOne.name+" "+article.title;
            if(alreadyHave(title)){
                console.log("skip "+title);
                continue;
            }
            add_article(name,article,thisOne.extract_func);
        }
	
    });
    feedparser.on('end',function(){
        nextFeed(index+1);
	    wg.done();
    });

    req.on('response',function(res){
	    if (res.statusCode!=200) {
		    console.log(thisOne.name+" error done");
		    wg.done();
		    return;
	    }

        console.log("list:"+name);
	    res.pipe(feedparser);
    });
}

nextFeed(0);


wg.wait(function(){
    if (changed) {
        old_data.modified = (new Date).getTime()/1000;
        jsonfile.writeFileSync('new_data.json',old_data,{spaces:2});
        console.log("write new file to new_data.json");
    }else{
        console.log("unchanged");
    }
});

